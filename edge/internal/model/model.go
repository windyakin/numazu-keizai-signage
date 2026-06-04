package model

import "time"

type Article struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	ImageKey    *string   `json:"imageKey"`
	QRKey       *string   `json:"qrKey"`
	Description *string   `json:"description"`
	Start       time.Time `json:"start"`
}

type ArticlesResponse struct {
	Articles []Article `json:"articles"`
}

type Ranking struct {
	ID       string    `json:"id"`
	Title    string    `json:"title"`
	ImageKey *string   `json:"imageKey"`
	Rank     int       `json:"rank"`
	Start    time.Time `json:"start"`
}

type RankingsResponse struct {
	Rankings  []Ranking  `json:"rankings"`
	FetchedAt *time.Time `json:"fetchedAt"`
}

type WeatherDay struct {
	Date        string   `json:"date"`
	DayOffset   int      `json:"dayOffset"`
	WeatherCode int      `json:"weatherCode"` // 気象庁 天気予報用テロップ番号
	Description string   `json:"description"`
	TempMin     *float64 `json:"tempMin"` // 気象庁が値を持たない場合は null
	TempMax     *float64 `json:"tempMax"`
	TempCurrent *float64 `json:"tempCurrent"` // アメダス現在気温（今日のみ）
	Pop         float64  `json:"pop"`
}

type WeatherResponse struct {
	Days      []WeatherDay `json:"days"`
	FetchedAt *time.Time   `json:"fetchedAt"`
}
