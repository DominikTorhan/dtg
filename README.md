# DTG Games

Small browser games as a plain static site.

- **Stack:** HTML + CSS + vanilla JavaScript. No framework, no bundler, no `npm install`.
- **Hosting now:** GitHub Pages (deployed by GitHub Actions from `site/`).
- **Hosting later:** Kubernetes, using a Docker image (nginx serving the same `site/`).

The same `site/` folder is the single source for both targets: Pages publishes it
as-is, and the Docker image copies it into nginx. Nothing is built.

## Layout

```
site/                  the whole website (this is what gets published)
  index.html           game list
  style.css            shared styles
  games/<name>/        one folder per game (index.html + <name>.js)
deploy/nginx.conf      nginx config used in the image (port 8080, /healthz)
deploy/k8s/app.yaml    Deployment + Service for later
Dockerfile             nginx-unprivileged + site/
.github/workflows/
  pages.yml            push to main -> GitHub Pages
  image.yml            push to main -> ghcr.io/<owner>/<repo> image
```

## Run locally

Any static server works:

```sh
python3 -m http.server -d site 8000      # http://localhost:8000
```

Or the container, exactly as k8s will run it:

```sh
docker build -t dtg .
docker run --rm -p 8080:8080 dtg         # http://localhost:8080
```

## Add a game

1. Create `site/games/<name>/index.html` and `site/games/<name>/<name>.js`.
2. Link `../../style.css` and use relative paths only (the site lives under
   `/<repo>/` on Pages but under `/` in the container).
3. Add a card to `site/index.html`.

## First-time GitHub setup

```sh
gh repo create dtg --public --source . --remote origin
git push -u origin main
gh api -X POST repos/{owner}/dtg/pages -f build_type=workflow
```

The site will be at `https://<user>.github.io/dtg/`.
The image lands in GHCR as `ghcr.io/<user>/dtg:latest` (private by default;
make the package public or use an imagePullSecret in k8s).

## Deploy to Kubernetes (later)

Edit `OWNER` in `deploy/k8s/app.yaml`, then `kubectl apply -f deploy/k8s/`.
Add an Ingress for your cluster's controller to expose it.

## Password gate

Every page loads `site/gate.js`, which hides the page behind a single shared
password until it has been entered once (remembered in `localStorage`).
It is a casual lock, not security: the check runs in the browser and can be
bypassed by anyone who reads the source.

- New pages must include it right after the stylesheet:
  `<script src="../../gate.js"></script>` (relative path).
- Change the password: run `dtgGate.hash("new password")` in the browser
  console and paste the result into `HASH` in `site/gate.js`.
- Lock this browser again: `dtgGate.lock()` in the console.
