package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/windyakin/numazu-keizai-signage/edge/internal/model"
)

type Weather struct {
	db *sql.DB
}

func NewWeather(db *sql.DB) *Weather {
	return &Weather{db: db}
}

// Replace wipes existing weather and inserts the new set in a single transaction.
func (w *Weather) Replace(ctx context.Context, days []model.WeatherDay, fetchedAt time.Time) error {
	tx, err := w.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM weather`); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO weather (date, day_offset, weather_code, description, temp_min, temp_max, temp_current, pop, fetched_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, d := range days {
		if _, err := stmt.ExecContext(ctx, d.Date, d.DayOffset, d.WeatherCode,
			d.Description, d.TempMin, d.TempMax, d.TempCurrent, d.Pop, fetchedAt); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (w *Weather) List(ctx context.Context) ([]model.WeatherDay, *time.Time, error) {
	rows, err := w.db.QueryContext(ctx, `
		SELECT date, day_offset, weather_code, description, temp_min, temp_max, temp_current, pop, fetched_at
		FROM weather
		ORDER BY day_offset ASC
	`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var out []model.WeatherDay
	var fetchedAt *time.Time
	for rows.Next() {
		var d model.WeatherDay
		var fa time.Time
		if err := rows.Scan(&d.Date, &d.DayOffset, &d.WeatherCode,
			&d.Description, &d.TempMin, &d.TempMax, &d.TempCurrent, &d.Pop, &fa); err != nil {
			return nil, nil, err
		}
		out = append(out, d)
		if fetchedAt == nil {
			fetchedAt = &fa
		}
	}
	return out, fetchedAt, rows.Err()
}
