# Qwen-Image-Edit Camera View Prompt WebUI

A small web UI to build camera view prompts for [fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA](https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA). Move the camera around a 3D cube to get the `<sks> [azimuth] [elevation] [distance]` prompt in real time.

## Run with Docker

```bash
docker build -t qwen-camera-prompt .
docker run -p 8080:80 qwen-camera-prompt
```

Then open **http://localhost:8080** in your browser.

One-liner (build + run, port 80 on host):

```bash
docker run -p 80:80 $(docker build -q .)
```

## Run locally (no Docker)

From the project folder:

```bash
npx serve .
```

Then open **http://localhost:3000** (or the URL shown by `serve`).

## Credits

Camera prompts follow the format from [fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA](https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA) on Hugging Face.

## License

MIT

---

**Sponsored by [NextHeberg](https://nextheberg.com)**
