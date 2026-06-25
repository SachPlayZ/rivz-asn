package scheduler

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"log"
	"time"

	"github.com/SachPlayZ/rivz-asn/backend/internal/calendarsync"
	"github.com/SachPlayZ/rivz-asn/backend/internal/config"
	emailpkg "github.com/SachPlayZ/rivz-asn/backend/internal/email"
	"github.com/SachPlayZ/rivz-asn/backend/internal/notifications"
	"github.com/SachPlayZ/rivz-asn/backend/internal/reminders"
	"github.com/SachPlayZ/rivz-asn/backend/internal/tasks"
	"github.com/jackc/pgx/v5/pgxpool"
)

const digestTmpl = `<!DOCTYPE html>
<html><body>
<h2>Daily Task Digest</h2>
<p>Here is your task summary for {{.Date}}:</p>
{{if .Overdue}}<h3>Overdue ({{len .Overdue}})</h3><ul>{{range .Overdue}}<li>{{.Title}} — due {{.Due}}</li>{{end}}</ul>{{end}}
{{if .DueToday}}<h3>Due Today ({{len .DueToday}})</h3><ul>{{range .DueToday}}<li>{{.Title}}</li>{{end}}</ul>{{end}}
</body></html>`

type taskItem struct {
	Title string
	Due   string
}

func Start(ctx context.Context, pool *pgxpool.Pool, notifSvc *notifications.Service, cfg *config.Config, calSyncSvc *calendarsync.Service, tasksSvc *tasks.Service) {
	// Fast loop (every minute): fire custom reminders close to their time.
	go func() {
		t := time.NewTicker(1 * time.Minute)
		defer t.Stop()
		remRepo := reminders.NewRepository(pool)
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-t.C:
				fireReminders(ctx, remRepo, notifSvc, now)
			}
		}
	}()

	// Background pull loop for Google Calendar sync (every 5 minutes)
	go func() {
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				pullGoogleCalendarChanges(ctx, calSyncSvc)
			}
		}
	}()

	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case t := <-ticker.C:
			runTick(ctx, pool, notifSvc, cfg, t, tasksSvc)
		}
	}
}

// fireReminders delivers custom per-task reminders whose time has come.
func fireReminders(ctx context.Context, repo *reminders.Repository, notifSvc *notifications.Service, now time.Time) {
	due, err := repo.DuePending(ctx, now)
	if err != nil {
		log.Printf("scheduler: reminders due: %v", err)
		return
	}
	for _, d := range due {
		msg := d.Note
		if msg == "" {
			if d.TaskTitle != "" {
				msg = "Reminder: " + d.TaskTitle
			} else {
				msg = "You have a reminder"
			}
		}
		notifSvc.Create(ctx, d.UserID, "reminder", d.TaskID, msg)
	}
}

func runTick(ctx context.Context, pool *pgxpool.Pool, notifSvc *notifications.Service, cfg *config.Config, now time.Time, tasksSvc *tasks.Service) {
	// Due reminders
	sendDueReminders(ctx, pool, notifSvc, now)
	// Daily digest at 8am UTC
	if now.UTC().Hour() == 8 {
		sendDailyDigests(ctx, pool, cfg, now)
	}
	// Catchup: spawn next instances for done recurring tasks that missed their spawn.
	if tasksSvc != nil {
		genereateMissedRecurrences(ctx, tasksSvc)
	}
}

func sendDueReminders(ctx context.Context, pool *pgxpool.Pool, notifSvc *notifications.Service, now time.Time) {
	const q = `SELECT id, user_id, title FROM tasks
		WHERE due_date BETWEEN $1 AND $2
		AND status NOT IN ('done','failed')`
	rows, err := pool.Query(ctx, q, now, now.Add(24*time.Hour))
	if err != nil {
		log.Printf("scheduler: due reminders query: %v", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id, userID, title string
		if err := rows.Scan(&id, &userID, &title); err != nil {
			continue
		}
		since := now.Add(-23 * time.Hour)
		exists, err := notifSvc.ExistsRecent(ctx, id, "due_reminder", since)
		if err != nil || exists {
			continue
		}
		msg := fmt.Sprintf("Task \"%s\" is due within 24 hours", title)
		notifSvc.Create(ctx, userID, "due_reminder", &id, msg)
	}
}

type digestData struct {
	Date     string
	Overdue  []taskItem
	DueToday []taskItem
}

func sendDailyDigests(ctx context.Context, pool *pgxpool.Pool, cfg *config.Config, now time.Time) {
	if cfg.SMTPHost == "" {
		return
	}
	const q = `SELECT id, email FROM users WHERE digest_enabled=true`
	rows, err := pool.Query(ctx, q)
	if err != nil {
		return
	}
	defer rows.Close()

	tmpl, _ := template.New("digest").Parse(digestTmpl)

	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	todayEnd := todayStart.Add(24 * time.Hour)

	for rows.Next() {
		var userID, email string
		if err := rows.Scan(&userID, &email); err != nil {
			continue
		}
		data := buildDigest(ctx, pool, userID, now, todayStart, todayEnd)
		if len(data.Overdue) == 0 && len(data.DueToday) == 0 {
			continue
		}
		var buf bytes.Buffer
		if err := tmpl.Execute(&buf, data); err != nil {
			continue
		}
		sendEmail(cfg, email, "Your Daily Task Digest", buf.String())
	}
}

func buildDigest(ctx context.Context, pool *pgxpool.Pool, userID string, now time.Time, todayStart, todayEnd time.Time) digestData {
	data := digestData{Date: now.Format("Jan 2, 2006")}

	overdueRows, _ := pool.Query(ctx,
		`SELECT title, due_date FROM tasks WHERE user_id=$1 AND due_date < $2 AND status NOT IN ('done','failed')`,
		userID, now)
	if overdueRows != nil {
		defer overdueRows.Close()
		for overdueRows.Next() {
			var title string
			var due time.Time
			if overdueRows.Scan(&title, &due) == nil {
				data.Overdue = append(data.Overdue, taskItem{Title: title, Due: due.Format("Jan 2")})
			}
		}
	}

	todayRows, _ := pool.Query(ctx,
		`SELECT title FROM tasks WHERE user_id=$1 AND due_date >= $2 AND due_date < $3 AND status NOT IN ('done','failed')`,
		userID, todayStart, todayEnd)
	if todayRows != nil {
		defer todayRows.Close()
		for todayRows.Next() {
			var title string
			if todayRows.Scan(&title) == nil {
				data.DueToday = append(data.DueToday, taskItem{Title: title})
			}
		}
	}

	return data
}

func sendEmail(cfg *config.Config, to, subject, htmlBody string) {
	if cfg.SMTPHost == "" {
		return
	}
	cl := emailpkg.New(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, cfg.FromEmail)
	if err := cl.SendNotification(to, subject, htmlBody, ""); err != nil {
		log.Printf("scheduler: send email to %s: %v", to, err)
	}
}

// genereateMissedRecurrences spawns new task instances for completed recurring
// tasks that have no child task yet (e.g. server was down at completion time).
func genereateMissedRecurrences(ctx context.Context, tasksSvc *tasks.Service) {
	if err := tasksSvc.SpawnMissedRecurrences(ctx); err != nil {
		log.Printf("scheduler: spawn missed recurrences: %v", err)
	}
}

func pullGoogleCalendarChanges(ctx context.Context, calSyncSvc *calendarsync.Service) {
	if calSyncSvc == nil {
		return
	}
	conns, err := calSyncSvc.ListConnections(ctx)
	if err != nil {
		log.Printf("scheduler: list calendar connections: %v", err)
		return
	}
	for _, c := range conns {
		if err := calSyncSvc.PullChanges(ctx, c.UserID); err != nil {
			log.Printf("scheduler: pull calendar changes for user %s: %v", c.UserID, err)
		}
	}
}
