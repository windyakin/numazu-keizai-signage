package sync

import (
	"sync"
	"time"
)

type StatusEntry struct {
	LastSuccess *time.Time
	LastError   *time.Time
	LastErrMsg  string
}

type SyncStatus struct {
	mu      sync.RWMutex
	entries map[string]*StatusEntry
}

func NewSyncStatus() *SyncStatus {
	return &SyncStatus{
		entries: make(map[string]*StatusEntry),
	}
}

func (s *SyncStatus) entry(name string) *StatusEntry {
	e, ok := s.entries[name]
	if !ok {
		e = &StatusEntry{}
		s.entries[name] = e
	}
	return e
}

func (s *SyncStatus) RecordSuccess(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	e := s.entry(name)
	e.LastSuccess = &now
}

func (s *SyncStatus) RecordError(name string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	e := s.entry(name)
	e.LastError = &now
	e.LastErrMsg = err.Error()
}

// LastSuccess returns the oldest last-success time across all registered syncers.
// Returns nil if any syncer has never succeeded.
func (s *SyncStatus) LastSuccess() *time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if len(s.entries) == 0 {
		return nil
	}
	var oldest *time.Time
	for _, e := range s.entries {
		if e.LastSuccess == nil {
			return nil
		}
		if oldest == nil || e.LastSuccess.Before(*oldest) {
			t := *e.LastSuccess
			oldest = &t
		}
	}
	return oldest
}
