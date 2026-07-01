package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/SachPlayZ/rivz-asn/backend/internal/groq"
	"github.com/SachPlayZ/rivz-asn/backend/internal/tasks"
)

// TaskCreator is the subset of tasks.Service used by the Telegram bot.
type TaskCreator interface {
	CreateTask(ctx context.Context, userID string, req tasks.CreateRequest) (*tasks.Task, error)
}

// Service manages the Telegram bot lifecycle and message handling.
type Service struct {
	repo       Repository
	tasksSvc   TaskCreator
	token      string
	botName    string
	groqClient *groq.Client

	mu        sync.Mutex
	authCodes map[string]authCodeEntry // code → {userID, expiresAt}
}

type authCodeEntry struct {
	userID    string
	expiresAt time.Time
}

// NewService creates a Telegram Service.
func NewService(repo Repository, tasksSvc TaskCreator, botToken string, groqClient *groq.Client) *Service {
	return &Service{
		repo:       repo,
		tasksSvc:   tasksSvc,
		token:      botToken,
		groqClient: groqClient,
		authCodes:  make(map[string]authCodeEntry),
	}
}

// GenerateAuthCode creates a one-time 6-digit link code for userID that
// expires in 10 minutes.
func (s *Service) GenerateAuthCode(userID string) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Clean expired codes first.
	now := time.Now()
	for code, entry := range s.authCodes {
		if entry.expiresAt.Before(now) {
			delete(s.authCodes, code)
		}
	}

	code := fmt.Sprintf("%06d", rand.Intn(1_000_000)) //nolint:gosec
	s.authCodes[code] = authCodeEntry{
		userID:    userID,
		expiresAt: now.Add(10 * time.Minute),
	}
	return code
}

// BotURL returns the Telegram deep-link URL for the bot (pre-fills the /start command).
func (s *Service) BotURL(code string) string {
	return fmt.Sprintf("https://t.me/%s?start=%s", s.botName, code)
}

// HandleMessage processes an incoming Telegram message.
func (s *Service) HandleMessage(ctx context.Context, chatID int64, username, text string) {
	text = strings.TrimSpace(text)

	// /start <code> → link the chat to the Fayde account.
	if strings.HasPrefix(text, "/start") {
		parts := strings.Fields(text)
		if len(parts) < 2 {
			s.sendMessage(chatID, "Send this command with your Fayde link code.\nGo to Fayde → Settings → Integrations → Telegram to get your code.")
			return
		}
		code := parts[1]

		s.mu.Lock()
		entry, ok := s.authCodes[code]
		if ok && entry.expiresAt.After(time.Now()) {
			delete(s.authCodes, code)
		} else {
			ok = false
		}
		s.mu.Unlock()

		if !ok {
			s.sendMessage(chatID, "❌ That code is invalid or has expired. Please generate a new one in Fayde Settings.")
			return
		}

		uname := username
		if uname == "" {
			uname = strconv.FormatInt(chatID, 10)
		}
		if err := s.repo.LinkUser(ctx, entry.userID, chatID, uname); err != nil {
			log.Printf("telegram: link user: %v", err)
			s.sendMessage(chatID, "❌ An error occurred. Please try again.")
			return
		}
		s.sendMessage(chatID, "✅ Your Telegram account is now linked to Fayde! Send me any message to create a task.")
		return
	}

	// Any other message → create a task for the linked user.
	userID, err := s.repo.UserIDByChat(ctx, chatID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			s.sendMessage(chatID, "Your Telegram account is not linked to Fayde yet.\nGo to Fayde → Settings → Integrations → Telegram to link it.")
		} else {
			log.Printf("telegram: lookup user: %v", err)
		}
		return
	}

	var req tasks.CreateRequest
	isAI := false
	if s.groqClient != nil {
		req = s.parseWithAI(ctx, text)
		isAI = true
	} else {
		req = tasks.CreateRequest{
			Title: text,
		}
	}

	task, err := s.tasksSvc.CreateTask(ctx, userID, req)
	if err != nil {
		log.Printf("telegram: create task for user %s: %v", userID, err)
		s.sendMessage(chatID, "❌ Failed to create task. Please try again.")
		return
	}

	msg := fmt.Sprintf("✅ Task created: *%s*", task.Title)
	if task.AssigneeID != nil && *task.AssigneeID != "" && *task.AssigneeID != userID {
		if name, err := s.repo.GetAssigneeName(ctx, *task.AssigneeID); err == nil {
			msg = fmt.Sprintf("✅ Task created and assigned to *%s*: *%s*", name, task.Title)
		}
	}
	if isAI {
		var details []string
		if task.Description != "" {
			details = append(details, fmt.Sprintf("📝 *Desc*: %s", task.Description))
		}
		if task.Priority != "" {
			details = append(details, fmt.Sprintf("⚡ *Priority*: %s", task.Priority))
		}
		if task.EffortPoints != nil {
			details = append(details, fmt.Sprintf("🔢 *Difficulty (Effort)*: %d", *task.EffortPoints))
		}
		if task.DueDate != nil {
			details = append(details, fmt.Sprintf("📅 *Due*: %s", task.DueDate.Format("2006-01-02")))
		}
		if len(details) > 0 {
			msg += "\n" + strings.Join(details, "\n")
		}
	}
	s.sendMessage(chatID, msg)
}

type parsedTask struct {
	Title                    string `json:"title"`
	Description              string `json:"description"`
	Priority                 string `json:"priority"`
	DueDate                  string `json:"due_date"`
	EffortPoints             *int   `json:"effort_points"`
	AssigneeTelegramUsername string `json:"assignee_telegram_username"`
	AssigneeEmail            string `json:"assignee_email"`
}

func (s *Service) parseWithAI(ctx context.Context, text string) tasks.CreateRequest {
	todayStr := time.Now().Format("2006-01-02")
	systemPrompt := fmt.Sprintf(`You are an agentic task planner. Process natural language task input.
Extract task details.
If the text implies a specific task title, extract/rephrase a concise title.
If it contains more context, set it as description.
If it implies a due date, output it in YYYY-MM-DD format (today is %s).
If you can estimate the difficulty/effort (on a scale of 1 to 10), set effort_points (integer).
If you can figure out priority, set priority ("low"|"medium"|"high").
If the text implies the task is for or assigned to another user, try to extract their Telegram username (e.g. "@username" -> "username") into assignee_telegram_username, or their email address into assignee_email.
Respond with ONLY valid JSON. Do not wrap the JSON in markdown code blocks:
{
  "title": "concise title",
  "description": "contextual details or rephrased instructions",
  "priority": "low"|"medium"|"high"|null,
  "due_date": "YYYY-MM-DD"|null,
  "effort_points": int|null,
  "assignee_telegram_username": "username"|null,
  "assignee_email": "email"|null
}`, todayStr)

	content, err := s.groqClient.Chat(ctx, []groq.Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: text},
	})
	if err != nil {
		log.Printf("telegram: AI parse failed: %v", err)
		return tasks.CreateRequest{Title: text}
	}

	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var p parsedTask
	if err := json.Unmarshal([]byte(content), &p); err != nil {
		log.Printf("telegram: unmarshal AI response failed: %v, content: %q", err, content)
		return tasks.CreateRequest{Title: text}
	}

	if p.Title == "" {
		p.Title = text
	}

	// Clean username prefix @ if present
	p.AssigneeTelegramUsername = strings.TrimPrefix(p.AssigneeTelegramUsername, "@")

	var assigneeID string
	if p.AssigneeTelegramUsername != "" {
		if aid, err := s.repo.UserIDByTelegramUsername(ctx, p.AssigneeTelegramUsername); err == nil {
			assigneeID = aid
		} else {
			log.Printf("telegram: lookup assignee by username %q: %v", p.AssigneeTelegramUsername, err)
		}
	}
	if assigneeID == "" && p.AssigneeEmail != "" {
		if aid, err := s.repo.UserIDByEmail(ctx, p.AssigneeEmail); err == nil {
			assigneeID = aid
		} else {
			log.Printf("telegram: lookup assignee by email %q: %v", p.AssigneeEmail, err)
		}
	}

	req := tasks.CreateRequest{
		Title:        p.Title,
		Description:  p.Description,
		Priority:     p.Priority,
		EffortPoints: p.EffortPoints,
	}

	if assigneeID != "" {
		req.AssigneeID = &assigneeID
	}

	if p.DueDate != "" {
		if t, err := time.Parse("2006-01-02", p.DueDate); err == nil {
			req.DueDate = &t
		}
	}

	return req
}

// StartPolling begins long-polling the Telegram Bot API for updates.
// It runs until ctx is cancelled.
func (s *Service) StartPolling(ctx context.Context) {
	if s.token == "" {
		return
	}

	// Resolve bot username once.
	if me, err := s.getMe(); err == nil {
		s.botName = me
	} else {
		log.Printf("telegram: getMe: %v", err)
	}

	log.Printf("telegram: polling started (bot @%s)", s.botName)
	var offset int64
	for {
		select {
		case <-ctx.Done():
			log.Println("telegram: polling stopped")
			return
		default:
		}

		updates, err := s.getUpdates(ctx, offset, 30)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("telegram: getUpdates: %v", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
			continue
		}

		for _, upd := range updates {
			if upd.UpdateID >= offset {
				offset = upd.UpdateID + 1
			}
			if upd.Message == nil {
				continue
			}
			go s.HandleMessage(ctx,
				upd.Message.Chat.ID,
				upd.Message.From.Username,
				upd.Message.Text,
			)
		}
	}
}

// ─── Telegram Bot API helpers ─────────────────────────────────────────────────

type tgUpdate struct {
	UpdateID int64       `json:"update_id"`
	Message  *tgMessage  `json:"message"`
}

type tgMessage struct {
	Text string    `json:"text"`
	Chat tgChat    `json:"chat"`
	From tgUser    `json:"from"`
}

type tgChat struct{ ID int64 `json:"id"` }
type tgUser struct{ Username string `json:"username"` }

func (s *Service) apiURL(method string) string {
	return fmt.Sprintf("https://api.telegram.org/bot%s/%s", s.token, method)
}

func (s *Service) getMe() (string, error) {
	resp, err := http.Get(s.apiURL("getMe")) //nolint:noctx
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var res struct {
		OK     bool `json:"ok"`
		Result struct {
			Username string `json:"username"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	if !res.OK {
		return "", fmt.Errorf("telegram getMe not ok")
	}
	return res.Result.Username, nil
}

func (s *Service) getUpdates(ctx context.Context, offset int64, timeout int) ([]tgUpdate, error) {
	url := fmt.Sprintf("%s?offset=%d&timeout=%d", s.apiURL("getUpdates"), offset, timeout)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: time.Duration(timeout+5) * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var res struct {
		OK          bool       `json:"ok"`
		ErrorCode   int        `json:"error_code"`
		Description string     `json:"description"`
		Result      []tgUpdate `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}
	if !res.OK {
		return nil, fmt.Errorf("telegram getUpdates not ok: %d - %s", res.ErrorCode, res.Description)
	}
	return res.Result, nil
}

func (s *Service) sendMessage(chatID int64, text string) {
	payload := map[string]any{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "Markdown",
	}
	raw, _ := json.Marshal(payload)
	resp, err := http.Post(s.apiURL("sendMessage"), "application/json", bytes.NewReader(raw)) //nolint:noctx
	if err != nil {
		log.Printf("telegram: sendMessage to %d: %v", chatID, err)
		return
	}
	resp.Body.Close()
}
