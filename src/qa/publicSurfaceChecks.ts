import { AppError } from "../domain/errors.js";

export type PublicSurfaceCheck = {
  name: string;
  detail: string;
};

const MIN_IMAGE_BYTES = 50_000;

export async function checkPublicWebSurfaces(publicBaseUrl: string): Promise<PublicSurfaceCheck[]> {
  const baseUrl = publicBaseUrl.replace(/\/$/, "");
  const checks: PublicSurfaceCheck[] = [];

  await checkHtml({
    name: "Landing page",
    url: `${baseUrl}/`,
    markers: [`content="${baseUrl}/og-image.png"`, 'src="/og-image.png"', "telegram-web-app.js"],
    checks
  });
  await checkHtml({
    name: "Operator dashboard",
    url: `${baseUrl}/admin`,
    markers: [`content="${baseUrl}/og-image.png"`, 'id="loginView"', 'id="dashboard"', "/api/admin/overview"],
    checks
  });
  await checkHtml({
    name: "Pool Mini App page",
    url: `${baseUrl}/pool/live-smoke`,
    markers: [`content="${baseUrl}/og-image.png"`, "telegram-web-app.js", "BNancy Pool", "/api/pools/"],
    checks
  });
  await checkImage(`${baseUrl}/og-image.png`, checks);

  return checks;
}

async function checkHtml(input: {
  name: string;
  url: string;
  markers: string[];
  checks: PublicSurfaceCheck[];
}): Promise<void> {
  const response = await fetchRequired(input.url, input.name);
  const html = await response.text();
  for (const marker of input.markers) {
    if (!html.includes(marker)) {
      throw new AppError("Public surface is missing expected content", {
        label: input.name,
        marker
      });
    }
  }
  input.checks.push({ name: input.name, detail: input.url });
}

async function checkImage(url: string, checks: PublicSurfaceCheck[]): Promise<void> {
  const response = await fetchRequired(url, "Brand image");
  const contentType = response.headers.get("content-type");
  if (contentType === null || !contentType.includes("image/png")) {
    throw new AppError("Brand image returned the wrong content type", {
      contentType: contentType === null ? "" : contentType
    });
  }
  const bytes = (await response.arrayBuffer()).byteLength;
  if (bytes < MIN_IMAGE_BYTES) {
    throw new AppError("Brand image is unexpectedly small", { bytes });
  }
  checks.push({ name: "Brand image", detail: `${url} bytes=${bytes}` });
}

async function fetchRequired(url: string, label: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new AppError("Public surface check failed", {
      label,
      status: response.status
    });
  }
  return response;
}
