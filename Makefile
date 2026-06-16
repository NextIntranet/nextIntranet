.PHONY: build build-prod up

# Build images capturing the current git commit / date as build args so the
# version endpoint (/api/v1/version/) reports them even in production images
# where .git is not available.
build:
	GIT_COMMIT=$$(git rev-parse --short HEAD) \
	GIT_BRANCH=$$(git rev-parse --abbrev-ref HEAD) \
	BUILD_DATE=$$(date -u +%FT%TZ) \
	BUILD_METHOD=$${BUILD_METHOD:-development} \
	docker compose build

build-prod:
	$(MAKE) build BUILD_METHOD=production

up:
	docker compose up
