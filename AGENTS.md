# Agent notes

## Constraints

- Keep the stack simple: plain HTML, CSS and vanilla JS. No frameworks, no
  bundler, no package.json, no build step. `site/` is published as-is.
- Use **relative paths only** inside `site/`. Pages serves it at `/<repo>/`,
  the container serves it at `/`.
- No external runtime dependencies (CDNs, fonts, analytics). Everything ships
  in `site/`.
- Each game is self-contained in `site/games/<name>/` and wrapped in an IIFE
  so games never share globals. Shared look goes in `site/style.css`.
- `localStorage` access must be wrapped in try/catch (private mode can throw).
- Games should work with keyboard and touch, at phone width.

## Checking a change

```sh
python3 -m http.server -d site 8000
docker build -t dtg . && docker run --rm -p 8080:8080 dtg
```

## Repo-specific rules

- Pushing, `gh repo create`, enabling Pages, and `kubectl apply` are the
  owner's steps - ask first (see global rules).
- Image config lives in `Dockerfile` + `deploy/nginx.conf`; keep the container
  non-root and listening on 8080.
