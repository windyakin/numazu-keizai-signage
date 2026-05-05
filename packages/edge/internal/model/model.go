package model

import "time"

type Article struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	ImageURL    string    `json:"imageUrl"`
	Description *string   `json:"description"`
	Start       time.Time `json:"start"`
}

type ArticlesResponse struct {
	Articles []Article `json:"articles"`
}

type Ranking struct {
	ID       string    `json:"id"`
	Title    string    `json:"title"`
	ImageURL string    `json:"imageUrl"`
	Rank     int       `json:"rank"`
	Start    time.Time `json:"start"`
}

type RankingsResponse struct {
	Rankings  []Ranking  `json:"rankings"`
	FetchedAt *time.Time `json:"fetchedAt"`
}
