package server

import (
	"net/http"
	"net/url"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
)

// buildMediaURL returns the URL the signage client should use to load the cached image.
// When the request originates from a file:// context (Origin: "null" or "file:..."),
// a file:// absolute URL pointing to the local disk is returned so the browser can
// load it without a network hop. For http/https origins (or no Origin header at all,
// e.g. curl) a URL to the edge server's own /media/* endpoint is returned instead.
func buildMediaURL(r *http.Request, mediaDir, localPath string) string {
	localPath = strings.TrimLeft(localPath, "/")
	origin := r.Header.Get("Origin")
	lower := strings.ToLower(origin)
	if lower == "null" || strings.HasPrefix(lower, "file:") {
		u := &url.URL{Scheme: "file"}
		p := filepath.ToSlash(filepath.Join(mediaDir, localPath))
		if len(p) > 0 && p[0] != '/' {
			p = "/" + p // Windows drive letter: C:/... → /C:/...
		}
		u.Path = p
		return u.String()
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host + "/media/" + localPath
}

func (s *Server) handleGetMedia(w http.ResponseWriter, r *http.Request) {
	_ = chi.URLParam(r, "*")
	http.StripPrefix("/media", http.FileServer(http.Dir(s.cfg.MediaDir))).ServeHTTP(w, r)
}
