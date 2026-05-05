package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	UpstreamAPIURL  string
	PollIntervalMin int
	MediaDir        string
	DBPath          string
	ListenAddr      string
	MediaURLPrefix  string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	upstream := os.Getenv("UPSTREAM_API_URL")
	if upstream == "" {
		return nil, fmt.Errorf("UPSTREAM_API_URL is required")
	}

	// バイナリ配置ディレクトリを基準にデフォルトを決める。
	// signage は file:// で開かれる前提で、絶対 file:// URL を返す。
	baseDir, err := executableDir()
	if err != nil {
		return nil, fmt.Errorf("locate executable dir: %w", err)
	}

	mediaDir, err := filepath.Abs(envStr("MEDIA_DIR", filepath.Join(baseDir, "media")))
	if err != nil {
		return nil, fmt.Errorf("resolve MEDIA_DIR: %w", err)
	}
	dbPath, err := filepath.Abs(envStr("DB_PATH", filepath.Join(baseDir, "edge.db")))
	if err != nil {
		return nil, fmt.Errorf("resolve DB_PATH: %w", err)
	}

	mediaURLPrefix := envStr("MEDIA_URL_PREFIX", "")
	if mediaURLPrefix == "" {
		mediaURLPrefix = fileURLFromPath(mediaDir)
	}

	return &Config{
		UpstreamAPIURL:  upstream,
		PollIntervalMin: envInt("POLL_INTERVAL_MIN", 5),
		MediaDir:        mediaDir,
		DBPath:          dbPath,
		ListenAddr:      envStr("LISTEN_ADDR", "127.0.0.1:8080"),
		MediaURLPrefix:  mediaURLPrefix,
	}, nil
}

// executableDir returns the directory containing the running executable.
// Falls back to CWD when run via `go run` (where the executable lives in a temp dir).
func executableDir() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exe)
	// `go run` puts the binary under TMPDIR/go-build*/exe → fall back to CWD so
	// `go run ./cmd/edge` keeps storing media under packages/edge/.
	if isGoBuildTmp(dir) {
		if cwd, err := os.Getwd(); err == nil {
			return cwd, nil
		}
	}
	return dir, nil
}

func isGoBuildTmp(dir string) bool {
	tmp := os.TempDir()
	rel, err := filepath.Rel(tmp, dir)
	if err != nil || rel == "." || filepath.IsAbs(rel) || len(rel) >= 2 && rel[0] == '.' && rel[1] == '.' {
		return false
	}
	return true
}

// fileURLFromPath turns an absolute filesystem path into a file:// URL.
// On Windows "C:\foo\bar" becomes "file:///C:/foo/bar".
func fileURLFromPath(absPath string) string {
	u := &url.URL{Scheme: "file"}
	p := filepath.ToSlash(absPath)
	if len(p) > 0 && p[0] != '/' {
		// Windows drive letter path
		p = "/" + p
	}
	u.Path = p
	return u.String()
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}
