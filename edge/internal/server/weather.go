package server

import (
	"encoding/json"
	"log"
	"net/http"
)

type weatherDayDTO struct {
	Date        string   `json:"date"`
	DayOffset   int      `json:"dayOffset"`
	WeatherCode int      `json:"weatherCode"`
	Description string   `json:"description"`
	TempMin     *float64 `json:"tempMin"`
	TempMax     *float64 `json:"tempMax"`
	TempCurrent *float64 `json:"tempCurrent"`
	Pop         float64  `json:"pop"`
}

type weatherResponse struct {
	Days      []weatherDayDTO `json:"days"`
	FetchedAt *string         `json:"fetchedAt"`
}

func (s *Server) handleGetWeather(w http.ResponseWriter, r *http.Request) {
	days, fetchedAt, err := s.weather.List(r.Context())
	if err != nil {
		log.Printf("weather list: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	res := weatherResponse{
		Days: make([]weatherDayDTO, 0, len(days)),
	}
	for _, d := range days {
		res.Days = append(res.Days, weatherDayDTO{
			Date:        d.Date,
			DayOffset:   d.DayOffset,
			WeatherCode: d.WeatherCode,
			Description: d.Description,
			TempMin:     d.TempMin,
			TempMax:     d.TempMax,
			TempCurrent: d.TempCurrent,
			Pop:         d.Pop,
		})
	}
	if fetchedAt != nil {
		ts := fetchedAt.UTC().Format("2006-01-02T15:04:05.000Z")
		res.FetchedAt = &ts
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}
