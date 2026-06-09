SIGNAGE_DIR := $(CURDIR)/signage
DIST_INDEX := $(SIGNAGE_DIR)/dist/index.html
CHROME_PROFILE := $(CURDIR)/.chrome-profile

EDGE_API_BASE ?= http://127.0.0.1:8080/api

# OS 検出して Chrome の実行パスを決める。CHROME=... で上書き可能。
UNAME_S := $(shell uname -s 2>/dev/null)
ifeq ($(UNAME_S),Darwin)
  CHROME ?= /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
else ifeq ($(UNAME_S),Linux)
  CHROME ?= $(shell command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser)
else ifneq (,$(findstring MINGW,$(UNAME_S))$(findstring MSYS,$(UNAME_S))$(findstring CYGWIN,$(UNAME_S)))
  # Git Bash / MSYS2 / Cygwin on Windows
  CHROME ?= /c/Program Files/Google/Chrome/Application/chrome.exe
else
  CHROME ?=
endif

RUSTFS_ENDPOINT  ?= http://localhost:9000
RUSTFS_BUCKET    ?= signage-media
RUSTFS_ACCESS_KEY ?= rustfsadmin
RUSTFS_SECRET_KEY ?= rustfsadmin

DEV_PORTS := 3000 5173 5174 8080

.PHONY: signage-build signage-open signage-run clean-profile storage-init kill-ports

signage-build:
	cd $(SIGNAGE_DIR) && VITE_API_BASE_URL=$(EDGE_API_BASE) npm run build

signage-open:
	@test -f "$(DIST_INDEX)" || (echo "dist がありません。先に 'make signage-build' を実行してください" && exit 1)
	@test -n "$(CHROME)" || (echo "Chrome の実行パスが特定できません。CHROME=... で指定してください" && exit 1)
	"$(CHROME)" \
		--user-data-dir="$(CHROME_PROFILE)" \
		--allow-file-access-from-files \
		--no-first-run \
		--no-default-browser-check \
		"file://$(DIST_INDEX)"

signage-run: signage-build signage-open

clean-profile:
	rm -rf "$(CHROME_PROFILE)"

storage-init:
	AWS_ACCESS_KEY_ID=$(RUSTFS_ACCESS_KEY) \
	AWS_SECRET_ACCESS_KEY=$(RUSTFS_SECRET_KEY) \
	aws s3 mb s3://$(RUSTFS_BUCKET) \
		--endpoint-url $(RUSTFS_ENDPOINT) \
		--region ap-northeast-1 \
	|| true

kill-ports:
	@for port in $(DEV_PORTS); do \
		pids=$$(lsof -ti tcp:$$port -sTCP:LISTEN 2>/dev/null); \
		if [ -n "$$pids" ]; then \
			echo "killing port $$port (pid: $$pids)"; \
			kill $$pids 2>/dev/null || true; \
			sleep 1; \
			pids=$$(lsof -ti tcp:$$port -sTCP:LISTEN 2>/dev/null); \
			if [ -n "$$pids" ]; then \
				echo "force killing port $$port (pid: $$pids)"; \
				kill -9 $$pids 2>/dev/null || true; \
			fi; \
		else \
			echo "port $$port: free"; \
		fi; \
	done
