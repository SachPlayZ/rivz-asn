package tasks

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AITaskSummary is used by the Groq AI handler.
type AITaskSummary struct {
	ID       string
	Title    string
	Status   string
	DueDate  *time.Time
	Priority string
}

// Repository defines persistence operations for tasks.
type Repository interface {
	CreateTask(ctx context.Context, userID string, req CreateRequest) (*Task, error)
	ListTasks(ctx context.Context, userID string, p ListParams) ([]*Task, int, error)
	GetTask(ctx context.Context, id, userID string) (*Task, error)
	UpdateTask(ctx context.Context, id, userID string, req UpdateRequest) (*Task, error)
	DeleteTask(ctx context.Context, id, userID string) error
	Reorder(ctx context.Context, userID string, items []ReorderItem) error
	BulkUpdate(ctx context.Context, userID string, req BulkUpdateRequest) error
	BulkDelete(ctx context.Context, userID string, ids []string) error
	CloneForRecurrence(ctx context.Context, original *Task) (*Task, error)
	ListForAI(ctx context.Context, userID string) ([]*AITaskSummary, error)
	UpdateStatusByID(ctx context.Context, taskID, status string) error
	ListAllWithDueDate(ctx context.Context, userID string) ([]*Task, error)
	// ListDoneRecurringWithoutChild returns completed recurring tasks that
	// have no child task yet — used by the scheduler for missed-recurrence catchup.
	ListDoneRecurringWithoutChild(ctx context.Context) ([]*Task, error)
}

// sortColumns is the whitelist of columns allowed in ORDER BY clauses.
var sortColumns = map[string]string{
	"created_at": "created_at",
	"updated_at": "updated_at",
	"due_date":   "due_date",
	"priority":   "priority",
	"sort_order": "sort_order",
}

type pgRepository struct {
	pool *pgxpool.Pool
}

// NewRepository returns a Postgres-backed Repository.
func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

const taskSelect = `t.id, t.user_id, t.title, t.description, t.status, t.priority,
	t.due_date, t.recurrence, t.recurrence_end, t.parent_task_id, t.assignee_id,
	a.email AS assignee_email, t.external_event_id, t.sort_order, t.effort_points, t.project_id,
	p.name AS project_name, t.created_at, t.updated_at`

// scanTask scans a task row (without tags/subtask counts — loaded separately).
func scanTask(row interface {
	Scan(dest ...any) error
}) (*Task, error) {
	t := &Task{}
	err := row.Scan(
		&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status, &t.Priority,
		&t.DueDate, &t.Recurrence, &t.RecurrenceEnd, &t.ParentTaskID, &t.AssigneeID,
		&t.AssigneeEmail, &t.ExternalEventID, &t.SortOrder, &t.EffortPoints, &t.ProjectID,
		&t.ProjectName, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	t.Tags = []Tag{}
	return t, nil
}

// loadTimeTotals loads total_time_seconds for a slice of tasks.
func (r *pgRepository) loadTimeTotals(ctx context.Context, tasks []*Task) error {
	if len(tasks) == 0 {
		return nil
	}
	ids := make([]string, len(tasks))
	idx := make(map[string]*Task, len(tasks))
	for i, t := range tasks {
		ids[i] = t.ID
		idx[t.ID] = t
	}
	rows, err := r.pool.Query(ctx,
		`SELECT task_id, COALESCE(SUM(duration_seconds),0)
		 FROM time_entries WHERE task_id=ANY($1) AND ended_at IS NOT NULL
		 GROUP BY task_id`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var taskID string
		var total int
		if err := rows.Scan(&taskID, &total); err != nil {
			return err
		}
		if t, ok := idx[taskID]; ok {
			t.TotalTimeSeconds = total
		}
	}
	return rows.Err()
}

// loadExtras loads tags and subtask counts for a slice of tasks.
func (r *pgRepository) loadExtras(ctx context.Context, tasks []*Task) error {
	if len(tasks) == 0 {
		return nil
	}
	ids := make([]string, len(tasks))
	idx := make(map[string]*Task, len(tasks))
	for i, t := range tasks {
		ids[i] = t.ID
		idx[t.ID] = t
	}

	// Tags
	tagRows, err := r.pool.Query(ctx,
		`SELECT tt.task_id, tg.id, tg.name, tg.color
		 FROM task_tags tt JOIN tags tg ON tg.id=tt.tag_id
		 WHERE tt.task_id = ANY($1)`, ids)
	if err != nil {
		return err
	}
	defer tagRows.Close()
	for tagRows.Next() {
		var taskID string
		var tag Tag
		if err := tagRows.Scan(&taskID, &tag.ID, &tag.Name, &tag.Color); err != nil {
			return err
		}
		if t, ok := idx[taskID]; ok {
			t.Tags = append(t.Tags, tag)
		}
	}
	if err := tagRows.Err(); err != nil {
		return err
	}

	// Subtask counts
	cntRows, err := r.pool.Query(ctx,
		`SELECT task_id, COUNT(*), COUNT(*) FILTER (WHERE done)
		 FROM subtasks WHERE task_id = ANY($1) GROUP BY task_id`, ids)
	if err != nil {
		return err
	}
	defer cntRows.Close()
	for cntRows.Next() {
		var taskID string
		var total, done int
		if err := cntRows.Scan(&taskID, &total, &done); err != nil {
			return err
		}
		if t, ok := idx[taskID]; ok {
			t.SubtaskCount = total
			t.SubtasksDone = done
		}
	}
	return cntRows.Err()
}

// CreateTask inserts a new task and returns the created record.
func (r *pgRepository) CreateTask(ctx context.Context, userID string, req CreateRequest) (*Task, error) {
	status := req.Status
	if status == "" {
		status = "todo"
	}
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	const q = `
		INSERT INTO tasks (user_id, title, description, status, priority, due_date,
			recurrence, recurrence_end, assignee_id)
		VALUES ($1,$2,$3,$4::task_status,$5::task_priority,$6,$7,$8,$9)
		RETURNING ` + taskSelect + `, 0 AS total_count
		FROM (SELECT * FROM tasks WHERE id=lastval()) t
		LEFT JOIN users a ON a.id=t.assignee_id`

	var insertQ = `INSERT INTO tasks (user_id, title, description, status, priority, due_date,
		recurrence, recurrence_end, assignee_id, effort_points, project_id)
		VALUES ($1,$2,$3,$4::task_status,$5::task_priority,$6,$7,$8,$9,$10,$11)
		RETURNING id`
	var id string
	err := r.pool.QueryRow(ctx, insertQ,
		userID, req.Title, req.Description, status, priority, req.DueDate,
		req.Recurrence, req.RecurrenceEnd, req.AssigneeID, req.EffortPoints, req.ProjectID,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("tasks: create: %w", err)
	}
	_ = q
	return r.GetTask(ctx, id, userID)
}

// ListTasks returns a page of tasks filtered by the given params, plus total count.
func (r *pgRepository) ListTasks(ctx context.Context, userID string, p ListParams) ([]*Task, int, error) {
	if p.Page < 1 {
		p.Page = 1
	}
	maxLimit := 100
	if p.DueDateFrom != nil || p.DueDateTo != nil {
		maxLimit = 500
	}
	if p.Limit < 1 || p.Limit > maxLimit {
		p.Limit = 20
	}

	args := []any{userID}
	conds := []string{"t.user_id = $1"}
	idx := 2

	if p.Status != "" {
		conds = append(conds, fmt.Sprintf("t.status = $%d::task_status", idx))
		args = append(args, p.Status)
		idx++
	}
	if p.Search != "" {
		conds = append(conds, fmt.Sprintf(
			"(t.title ILIKE $%d OR t.description ILIKE $%d OR TO_CHAR(t.due_date,'Mon DD, YYYY') ILIKE $%d OR TO_CHAR(t.due_date,'YYYY-MM-DD') ILIKE $%d)",
			idx, idx, idx, idx,
		))
		args = append(args, "%"+p.Search+"%")
		idx++
	}
	if p.ProjectID != "" {
		conds = append(conds, fmt.Sprintf("t.project_id = $%d", idx))
		args = append(args, p.ProjectID)
		idx++
	}
	if p.DueDateFrom != nil {
		conds = append(conds, fmt.Sprintf("t.due_date >= $%d", idx))
		args = append(args, *p.DueDateFrom)
		idx++
	}
	if p.DueDateTo != nil {
		conds = append(conds, fmt.Sprintf("t.due_date <= $%d", idx))
		args = append(args, *p.DueDateTo)
		idx++
	}

	where := strings.Join(conds, " AND ")
	col, ok := sortColumns[p.Sort]
	if !ok {
		col = "created_at"
	}
	order := "DESC"
	if strings.ToUpper(p.Order) == "ASC" {
		order = "ASC"
	}
	offset := (p.Page - 1) * p.Limit

	orderBy := fmt.Sprintf("t.%s %s NULLS LAST", col, order)
	if col != "sort_order" {
		orderBy = fmt.Sprintf(`CASE t.status::text
			WHEN 'in_progress' THEN 1
			WHEN 'todo' THEN 2
			WHEN 'done' THEN 3
			WHEN 'failed' THEN 4
			ELSE 5
		END ASC, %s`, orderBy)
	}

	q := fmt.Sprintf(`
		SELECT %s, COUNT(*) OVER() AS total_count
		FROM tasks t
		LEFT JOIN users a ON a.id=t.assignee_id
		LEFT JOIN projects p ON p.id=t.project_id
		WHERE %s
		ORDER BY %s
		LIMIT $%d OFFSET $%d`, taskSelect, where, orderBy, idx, idx+1)
	args = append(args, p.Limit, offset)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("tasks: list query: %w", err)
	}
	defer rows.Close()

	var tasks []*Task
	var total int

	for rows.Next() {
		t := &Task{}
		err := rows.Scan(
			&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status, &t.Priority,
			&t.DueDate, &t.Recurrence, &t.RecurrenceEnd, &t.ParentTaskID, &t.AssigneeID,
			&t.AssigneeEmail, &t.ExternalEventID, &t.SortOrder, &t.EffortPoints, &t.ProjectID,
			&t.ProjectName, &t.CreatedAt, &t.UpdatedAt,
			&total,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("tasks: list scan: %w", err)
		}
		t.Tags = []Tag{}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("tasks: list rows: %w", err)
	}
	if err := r.loadExtras(ctx, tasks); err != nil {
		return nil, 0, err
	}
	if err := r.loadTimeTotals(ctx, tasks); err != nil {
		return nil, 0, err
	}

	return tasks, total, nil
}

// GetTask fetches a single task by id, scoped to the owning user.
func (r *pgRepository) GetTask(ctx context.Context, id, userID string) (*Task, error) {
	q := fmt.Sprintf(`SELECT %s
		FROM tasks t
		LEFT JOIN users a ON a.id=t.assignee_id
		LEFT JOIN projects p ON p.id=t.project_id
		WHERE t.id=$1 AND t.user_id=$2`, taskSelect)

	t := &Task{}
	err := r.pool.QueryRow(ctx, q, id, userID).Scan(
		&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status, &t.Priority,
		&t.DueDate, &t.Recurrence, &t.RecurrenceEnd, &t.ParentTaskID, &t.AssigneeID,
		&t.AssigneeEmail, &t.ExternalEventID, &t.SortOrder, &t.EffortPoints, &t.ProjectID,
		&t.ProjectName, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("tasks: get: %w", err)
	}
	t.Tags = []Tag{}
	if err := r.loadExtras(ctx, []*Task{t}); err != nil {
		return nil, err
	}
	if err := r.loadTimeTotals(ctx, []*Task{t}); err != nil {
		return nil, err
	}
	return t, nil
}

// UpdateTask applies a partial update to a task and returns the updated record.
func (r *pgRepository) UpdateTask(ctx context.Context, id, userID string, req UpdateRequest) (*Task, error) {
	sets := []string{"updated_at = now()"}
	args := []any{}
	argIdx := 1

	if req.Title != nil {
		sets = append(sets, fmt.Sprintf("title = $%d", argIdx))
		args = append(args, *req.Title)
		argIdx++
	}
	if req.IsPresent("description") {
		sets = append(sets, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, req.Description)
		argIdx++
	}
	if req.Status != nil {
		sets = append(sets, fmt.Sprintf("status = $%d::task_status", argIdx))
		args = append(args, *req.Status)
		argIdx++
	}
	if req.Priority != nil {
		sets = append(sets, fmt.Sprintf("priority = $%d::task_priority", argIdx))
		args = append(args, *req.Priority)
		argIdx++
	}
	if req.IsPresent("due_date") {
		sets = append(sets, fmt.Sprintf("due_date = $%d", argIdx))
		args = append(args, req.DueDate)
		argIdx++
	}
	if req.IsPresent("recurrence") {
		sets = append(sets, fmt.Sprintf("recurrence = $%d", argIdx))
		args = append(args, req.Recurrence)
		argIdx++
	}
	if req.IsPresent("recurrence_end") {
		sets = append(sets, fmt.Sprintf("recurrence_end = $%d", argIdx))
		args = append(args, req.RecurrenceEnd)
		argIdx++
	}
	if req.IsPresent("assignee_id") {
		sets = append(sets, fmt.Sprintf("assignee_id = $%d", argIdx))
		args = append(args, req.AssigneeID)
		argIdx++
	}
	if req.SortOrder != nil {
		sets = append(sets, fmt.Sprintf("sort_order = $%d", argIdx))
		args = append(args, *req.SortOrder)
		argIdx++
	}
	if req.IsPresent("effort_points") {
		sets = append(sets, fmt.Sprintf("effort_points = $%d", argIdx))
		args = append(args, req.EffortPoints)
		argIdx++
	}
	if req.IsPresent("project_id") {
		sets = append(sets, fmt.Sprintf("project_id = $%d", argIdx))
		args = append(args, req.ProjectID)
		argIdx++
	}

	args = append(args, id, userID)

	q := fmt.Sprintf(`UPDATE tasks SET %s WHERE id=$%d AND user_id=$%d RETURNING id`,
		strings.Join(sets, ", "), argIdx, argIdx+1)

	var updatedID string
	if err := r.pool.QueryRow(ctx, q, args...).Scan(&updatedID); err != nil {
		return nil, fmt.Errorf("tasks: update: %w", err)
	}
	return r.GetTask(ctx, updatedID, userID)
}

// DeleteTask removes a task scoped to the owning user.
func (r *pgRepository) DeleteTask(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM tasks WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("tasks: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("tasks: delete: %w", ErrNotFound)
	}
	return nil
}

// Reorder bulk-updates sort_order in a single transaction.
func (r *pgRepository) Reorder(ctx context.Context, userID string, items []ReorderItem) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	for _, item := range items {
		if _, err := tx.Exec(ctx,
			`UPDATE tasks SET sort_order=$1 WHERE id=$2 AND user_id=$3`,
			item.SortOrder, item.ID, userID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// BulkUpdate updates status and/or priority for a set of tasks owned by userID.
func (r *pgRepository) BulkUpdate(ctx context.Context, userID string, req BulkUpdateRequest) error {
	if len(req.IDs) == 0 {
		return nil
	}
	sets := []string{"updated_at=now()"}
	args := []any{}
	argIdx := 1
	if req.Status != nil {
		sets = append(sets, fmt.Sprintf("status=$%d::task_status", argIdx))
		args = append(args, *req.Status)
		argIdx++
	}
	if req.Priority != nil {
		sets = append(sets, fmt.Sprintf("priority=$%d::task_priority", argIdx))
		args = append(args, *req.Priority)
		argIdx++
	}
	if len(sets) == 1 {
		return nil
	}
	args = append(args, req.IDs, userID)
	q := fmt.Sprintf(`UPDATE tasks SET %s WHERE id=ANY($%d) AND user_id=$%d`,
		strings.Join(sets, ","), argIdx, argIdx+1)
	_, err := r.pool.Exec(ctx, q, args...)
	return err
}

// BulkDelete deletes multiple tasks owned by userID.
func (r *pgRepository) BulkDelete(ctx context.Context, userID string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := r.pool.Exec(ctx, `DELETE FROM tasks WHERE id=ANY($1) AND user_id=$2`, ids, userID)
	return err
}

// ListForAI returns minimal task data for AI analysis (no tags/extras).
func (r *pgRepository) ListForAI(ctx context.Context, userID string) ([]*AITaskSummary, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, title, status, due_date, priority
		 FROM tasks WHERE user_id=$1 AND status NOT IN ('done','failed')
		 ORDER BY created_at DESC LIMIT 200`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []*AITaskSummary
	for rows.Next() {
		s := &AITaskSummary{}
		if err := rows.Scan(&s.ID, &s.Title, &s.Status, &s.DueDate, &s.Priority); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

// UpdateStatusByID updates a task's status without user scoping (used by webhooks).
func (r *pgRepository) UpdateStatusByID(ctx context.Context, taskID, status string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE tasks SET status=$1::task_status, updated_at=now() WHERE id=$2`,
		status, taskID)
	return err
}

// ListAllWithDueDate returns all tasks with a due date for the user (for CSV/ICS export).
func (r *pgRepository) ListAllWithDueDate(ctx context.Context, userID string) ([]*Task, error) {
	q := fmt.Sprintf(`SELECT %s
		FROM tasks t
		LEFT JOIN users a ON a.id=t.assignee_id
		LEFT JOIN projects p ON p.id=t.project_id
		WHERE t.user_id=$1 AND t.due_date IS NOT NULL
		ORDER BY t.due_date ASC`, taskSelect)
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tasks []*Task
	for rows.Next() {
		t := &Task{}
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status, &t.Priority,
			&t.DueDate, &t.Recurrence, &t.RecurrenceEnd, &t.ParentTaskID, &t.AssigneeID,
			&t.AssigneeEmail, &t.ExternalEventID, &t.SortOrder, &t.EffortPoints, &t.ProjectID,
			&t.ProjectName, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("tasks: list-due scan: %w", err)
		}
		t.Tags = []Tag{}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

// CloneForRecurrence creates a new task instance based on a recurring original.
func (r *pgRepository) CloneForRecurrence(ctx context.Context, original *Task) (*Task, error) {
	const q = `INSERT INTO tasks
		(user_id, title, description, status, priority, due_date,
		 recurrence, recurrence_end, parent_task_id, assignee_id)
		VALUES ($1,$2,$3,'todo'::task_status,$4::task_priority,$5,$6,$7,$8,$9)
		RETURNING id`
	var id string
	err := r.pool.QueryRow(ctx, q,
		original.UserID, original.Title, original.Description, original.Priority,
		original.DueDate, original.Recurrence, original.RecurrenceEnd, &original.ID, original.AssigneeID,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("tasks: clone: %w", err)
	}
	return r.GetTask(ctx, id, original.UserID)
}

// ListDoneRecurringWithoutChild returns completed recurring tasks that have no
// child task yet. Used by the scheduler to catch up on missed recurrences.
func (r *pgRepository) ListDoneRecurringWithoutChild(ctx context.Context) ([]*Task, error) {
	q := fmt.Sprintf(`SELECT %s
		FROM tasks t
		LEFT JOIN users a ON a.id=t.assignee_id
		LEFT JOIN projects p ON p.id=t.project_id
		WHERE t.status = 'done'
		  AND t.recurrence IS NOT NULL
		  AND t.recurrence != ''
		  AND NOT EXISTS (
		    SELECT 1 FROM tasks child WHERE child.parent_task_id = t.id
		  )`, taskSelect)
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("tasks: list done recurring: %w", err)
	}
	defer rows.Close()
	var result []*Task
	for rows.Next() {
		t := &Task{}
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status, &t.Priority,
			&t.DueDate, &t.Recurrence, &t.RecurrenceEnd, &t.ParentTaskID, &t.AssigneeID,
			&t.AssigneeEmail, &t.ExternalEventID, &t.SortOrder, &t.EffortPoints, &t.ProjectID,
			&t.ProjectName, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("tasks: list done recurring scan: %w", err)
		}
		t.Tags = []Tag{}
		result = append(result, t)
	}
	return result, rows.Err()
}
