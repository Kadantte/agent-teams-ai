import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";

import { AuthenticateDesktopClientUseCase } from "@agent-teams-control-plane/features-workspace-identity";
import {
  extractDesktopBearerToken,
  type DesktopAuthRequestLike,
} from "@agent-teams-control-plane/features-workspace-identity/interface/nest";

import { CompleteGitHubClaimOAuthUseCase } from "../../application/use-cases/complete-github-claim-oauth.use-case.js";
import { GetGitHubSetupStatusUseCase } from "../../application/use-cases/get-github-setup-status.use-case.js";
import { HandleGitHubSetupCallbackUseCase } from "../../application/use-cases/handle-github-setup-callback.use-case.js";
import { StartGitHubClaimOAuthUseCase } from "../../application/use-cases/start-github-claim-oauth.use-case.js";
import { StartGitHubInstallationSetupUseCase } from "../../application/use-cases/start-github-installation-setup.use-case.js";

@Controller()
export class GitHubInstallationSetupController {
  public constructor(
    @Inject(AuthenticateDesktopClientUseCase)
    private readonly authenticateDesktopClient: AuthenticateDesktopClientUseCase,
    @Inject(StartGitHubInstallationSetupUseCase)
    private readonly startSetup: StartGitHubInstallationSetupUseCase,
    @Inject(GetGitHubSetupStatusUseCase)
    private readonly getSetupStatus: GetGitHubSetupStatusUseCase,
    @Inject(HandleGitHubSetupCallbackUseCase)
    private readonly handleSetupCallback: HandleGitHubSetupCallbackUseCase,
    @Inject(StartGitHubClaimOAuthUseCase)
    private readonly startClaimOAuth: StartGitHubClaimOAuthUseCase,
    @Inject(CompleteGitHubClaimOAuthUseCase)
    private readonly completeClaimOAuth: CompleteGitHubClaimOAuthUseCase,
  ) {}

  @Post("api/desktop/v1/integrations/github/setup/start")
  public async startGitHubSetup(@Req() request: DesktopAuthRequestLike) {
    const actor = await this.authenticateDesktopClient.require(
      extractDesktopBearerToken(request),
    );
    return this.startSetup.execute(actor);
  }

  @Get("api/desktop/v1/integrations/github/setup/:setupSessionId")
  public async getGitHubSetupStatus(
    @Param("setupSessionId") setupSessionId: string,
    @Req() request: DesktopAuthRequestLike,
  ) {
    const actor = await this.authenticateDesktopClient.require(
      extractDesktopBearerToken(request),
    );
    return this.getSetupStatus.execute({ actor, setupSessionId });
  }

  @Get("api/public/github/setup")
  @Header("content-type", "text/html; charset=utf-8")
  public async publicSetupCallback(@Query() query: Record<string, unknown>) {
    const installationId = singleQueryString(query.installation_id);
    const state = singleQueryString(query.state);
    const result = await this.handleSetupCallback.execute({
      ...(installationId === undefined ? {} : { installationId }),
      ...(state === undefined ? {} : { state }),
    });
    if (result.kind === "untrusted-callback") {
      return renderGitHubSetupRestartPage();
    }
    return renderGitHubSetupClaimPage({
      claimContinuationToken: result.claimContinuationToken,
      claimId: result.claimId,
      setupSessionId: result.setupSessionId,
    });
  }

  @Post("api/public/github/claim/:claimId/start")
  public async startPublicClaimOAuth(
    @Param("claimId") claimId: string,
    @Body() body: { claimContinuationToken?: string },
  ) {
    const claimContinuationToken = singleBodyString(body.claimContinuationToken);
    return this.startClaimOAuth.execute({
      claimId,
      ...(claimContinuationToken === undefined ? {} : { claimContinuationToken }),
    });
  }

  @Get("api/public/github/claim/:claimId/start")
  @Header("content-type", "text/html; charset=utf-8")
  public async startPublicClaimOAuthFromBrowser(
    @Param("claimId") claimId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const claimContinuationToken = singleQueryString(query.claimContinuationToken);
    const result = await this.startClaimOAuth.execute({
      claimId,
      ...(claimContinuationToken === undefined ? {} : { claimContinuationToken }),
    });
    return renderGitHubClaimOAuthRedirectPage(result.authorizationUrl);
  }

  @Get("api/public/github/oauth/callback")
  public async publicOAuthCallback(@Query() query: Record<string, unknown>) {
    const code = singleQueryString(query.code);
    const providerErrorCode = singleQueryString(query.error);
    const state = singleQueryString(query.state);
    return this.completeClaimOAuth.execute({
      duplicateParameter:
        hasDuplicate(query.code) ||
        hasDuplicate(query.state) ||
        hasDuplicate(query.error),
      ...(code === undefined ? {} : { code }),
      ...(providerErrorCode === undefined ? {} : { providerErrorCode }),
      ...(state === undefined ? {} : { state }),
    });
  }
}

function singleQueryString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.length === 1 && typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function singleBodyString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function hasDuplicate(value: unknown): boolean {
  return Array.isArray(value) && value.length > 1;
}

function renderGitHubSetupRestartPage(): string {
  return renderHtmlPage({
    body:
      "<p>This GitHub App installation callback could not be matched to an active setup session.</p>" +
      "<p>Restart GitHub setup from Agent Teams Desktop.</p>",
    title: "GitHub setup restart required",
  });
}

function renderGitHubSetupClaimPage(input: {
  claimContinuationToken: string;
  claimId: string;
  setupSessionId: string;
}): string {
  const claimUrl = `/api/public/github/claim/${encodeURIComponent(input.claimId)}/start`;
  return renderHtmlPage({
    body:
      `<p>GitHub App installation was received for setup session ${escapeHtml(
        input.setupSessionId,
      )}.</p>` +
      '<form id="claim-start-form"><button class="button" type="submit">Continue with GitHub account verification</button></form>' +
      "<script>" +
      'document.getElementById("claim-start-form").addEventListener("submit",async(event)=>{' +
      "event.preventDefault();" +
      `const response=await fetch("${escapeJavaScriptString(claimUrl)}",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({claimContinuationToken:"${escapeJavaScriptString(
        input.claimContinuationToken,
      )}"})});` +
      "const payload=await response.json();" +
      "if(response.ok&&payload.authorizationUrl){window.location.assign(payload.authorizationUrl);return;}" +
      'document.body.insertAdjacentHTML("beforeend","<p>Unable to start GitHub verification. Restart setup from Agent Teams Desktop.</p>");' +
      "});" +
      "</script>",
    title: "Continue GitHub setup",
  });
}

function renderGitHubClaimOAuthRedirectPage(authorizationUrl: string): string {
  const escapedUrl = escapeHtml(authorizationUrl);
  return renderHtmlPage({
    body:
      `<meta http-equiv="refresh" content="0;url=${escapedUrl}">` +
      `<p>Redirecting to GitHub OAuth...</p>` +
      `<p><a class="button" href="${escapedUrl}">Continue to GitHub</a></p>`,
    title: "Redirecting to GitHub",
  });
}

function renderHtmlPage(input: { title: string; body: string }): string {
  return (
    "<!doctype html>" +
    '<html lang="en">' +
    "<head>" +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHtml(input.title)}</title>` +
    "<style>" +
    "body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:48px auto;max-width:640px;padding:0 24px;color:#111827;line-height:1.5}" +
    ".button{display:inline-block;border-radius:6px;background:#111827;color:white;padding:10px 14px;text-decoration:none;font-weight:600}" +
    "</style>" +
    "</head>" +
    `<body><h1>${escapeHtml(input.title)}</h1>${input.body}</body>` +
    "</html>"
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJavaScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/</g, "\\u003c");
}
