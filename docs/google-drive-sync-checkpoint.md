# Google Drive Sync Implementation Checkpoint

Last updated: 2026-09-03

## Baseline and repository state

- Branch: `upstream-integrated-features`
- Baseline commit: `ffb04c3d`
- Implementation commit: `54968765` (`feat: add encrypted Google Drive sync`).
- The source implementation and checkpoint are committed and pushed to `origin/upstream-integrated-features`.
- Existing manual backup/import v1/v2 remains unchanged and is the separate disaster-recovery path.
- Cloud sync remains optional. The complete controller adapter is registered only in the child Tauri app; nothing connects or uploads until the user explicitly connects Google Drive.

## Product decisions

- The Windows laptop is the authoritative first-bootstrap source because it has the complete chat history.
- State is account-scoped even though only one Grindr profile is currently used.
- Google Drive uses the personal Google One account's hidden `appDataFolder` and the minimum app-data scope.
- Packages are end-to-end encrypted; pairing explicitly transfers the recovery key.
- Core data will sync automatically. Large media remains disabled until a separate opt-in, Wi-Fi-only blob design exists.
- iOS 17.0 + TrollStore cannot promise background execution after the app is swiped away. Launch/resume catch-up is the supported guarantee.
- The app is always installed over the existing bundle ID (`dev.estopia.free-grind`); sync state must survive upgrades.

## Six-step plan status

1. **Complete:** repository/history/storage/lifecycle audit and implementation plan.
2. **Complete after store-bound identity hardening:** account-scoped protocol/journal/native prerequisites and profile-isolated data are complete. Schema v4 binds the per-install cloud source ID inside each profile's durable sync store, restores a missing browser copy from that binding, recovers exactly one pre-v4 local counter/outbox source, and fails closed on conflicts, ambiguous legacy sources, or an enrolled unbound store with no recoverable browser ID. Manual backup retains its separate ephemeral fallback.
3. **Complete after final reset hardening:** pairing rollback floors, direct-create cleanup, and response-lost create recovery all best-effort remove their exact verified pending files when the anchor is absent/revoked; a present conflicting anchor never authorizes deletion.
4. **Complete after final recovery UX hardening:** lifecycle/cache/UI integration is complete, and every connected device exposes a Google reauthorization action that preserves its namespace, bootstrap identity, and vault key even after the structured error flag is lost on restart.
5. **Windows and macOS CI complete after schema-v4 identity hardening; real-device validation is in progress:** every Windows-verifiable protocol/controller checkpoint is covered, including pairing rollback, remote fault/reset interruption, the 3 MiB package-size boundary, two-device convergence, store-bound source identity, reauthorization, the full 113-test suite, and a fresh optimized Tauri compile. Credential-enabled Windows and unsigned iOS artifacts build successfully in CI. The credential-enabled Windows artifact is now running against the authoritative profile after a verified full backup; real OAuth and iPhone/TrollStore behavior remain.
6. **Security/release review, OAuth provisioning, and test-artifact packaging complete; external acceptance has started:** release-workflow OAuth/iOS packaging fixes are committed and statically verified. Both GitHub repository secret names are configured, the store-bound source-identity P1 is resolved, its independent bounded review found no P0/P1/P2 issue, and the final Windows matrix is green. Real account authorization, pairing, convergence, refresh, and over-install validation remain.

## Completed implementation

- Per-profile contact/nickname database migration and stable keyset paging.
- Explicit portable-data allowlists for chat data, contact index, interest views, and selected preferences.
- Immutable, versioned packages with monotonic source sequences, Lamport revisions, tombstones, deterministic conflicts, strict validation, canonical hashing, and idempotent receipts.
- Durable per-profile reconciliation store with outbox-before-shadow ordering, crash recovery, bootstrap metadata, immutable outbound ledger, inbound heads, and a 3 MiB plaintext package ceiling.
- Windows system-browser OAuth + PKCE, system credential storage, AES-256-GCM, and Drive `appDataFolder` list/download/create/update/delete commands.
- iOS OAuth implementation using `ASWebAuthenticationSession`, Rust-owned PKCE/state/token exchange, strict reversed callback scheme validation, and build/CI configuration hooks.
- Strict encrypted anchor, package, pairing, filename, namespace, and authenticated-metadata wire formats.
- Controller ordering: reconcile local data, verify remote history, apply incoming packages, reconcile again, verify before upload, stage/upload immutable packages, final pull/apply, and final reconciliation.
- Account switching waits for chat, contact-index, and interest-view account tokens to agree; stale asynchronous setup cannot mark a new profile ready.

## Safety decisions completed on 2026-08-31

- Remote domain mutation is compare-and-apply, not a blind overwrite. Chat/contact rows compare inside their serialized SQLite write queues, interest views compare inside one IndexedDB read/write transaction, and allowlisted preferences compare/set synchronously.
- The incoming value is accepted when the domain already reflects it (crash replay) or still equals the expected durable shadow. A divergent local value is preserved; the remote receipt is recorded without advancing the shadow, and the final reconciliation emits a causally newer local operation above the observed remote Lamport clock.
- Authority bootstrap applies and receipts a package before superseding local operations at or below the persisted pairing cutoff. Duplicate replay repeats bounded supersession, closing the apply/receipt-to-supersede crash window.
- Post-cutoff phone edits are never blindly restored. They remain in the domain and are causally promoted relative to the authority shadow.
- Pairing retries preserve the original `localBaselineSequence`. Importing the same pairing key for an established device only recovers/re-enables the key and does not re-enter bootstrap.
- Before upload, the controller verifies the confirmed local Drive head, the complete pending package chain, exact response-lost remote prefixes, and every durably applied inbound head. Unknown same-device successors, deleted confirmed packages, or missing inbound suffixes stop synchronization instead of creating a fork or accepting rollback.
- Exact response-lost creates are marked uploaded only after the entire local ledger and remote prefix validate. A secondary device that somehow published local history before bootstrap completed hard-stops and must be reset/re-paired.

## Step 4 lifecycle checkpoint completed on 2026-08-31

- A single process-wide controller manager is registered only in the child Tauri app. Web development and manager mode retain the explicit unavailable adapter.
- Sync readiness now requires the authenticated profile, `settingsReady`, and exact chat/contact/interest store-token agreement. `SET_USER` and `CLEAR_USER` synchronously close the old readiness window.
- Account changes immediately invalidate the old controller, then drain and permanently close obsolete controller queues before replacing the chat/contact stores. A closed controller cannot reopen its store during a rapid switch back.
- Automatic catch-up runs after ready launch, visible/focus/page-show/online transitions, and every five minutes while the Windows process is alive. iOS suspension/force-quit behavior remains unchanged; its guarantee is next-launch/resume catch-up.
- Fresh iOS OAuth now stops in the pairing state without creating a namespace, key, anchor, or package. Importing the laptop pairing code completes enrollment.
- Remote-operation processing reloads only allowlisted process caches, rechecks profile readiness after awaiting them, and emits a profile-scoped event. Cache/UI reload failures do not turn a durably completed sync into a sync failure.
- Adapter subscribers ignore delayed snapshots and callbacks from a replaced adapter.
- Mounted chat/search, grid/contact metadata, browse filters, preferences, interest indicators, saved locations/phrases, privacy, automation-safe controls, and block history refresh from the active profile without route remounts or lost drafts. Search indexes are atomically replaced so remote deletions cannot remain searchable.
- The pairing UI now describes the actual private pairing-code flow and does not expose the intentionally unsupported Wi-Fi media option.

## Current verification

- `npm run type-check` — passes.
- `npm run build` — passes (only the existing Vite chunk-size/static+dynamic import warnings).
- `bunx tauri build --no-bundle` — passes after schema-v4 identity hardening and produces a fresh `src-tauri/target/release/free-grind.exe`. The first resumed attempt reached the final link but found that exact workspace executable running; after stopping only that verified process, the incremental retry completed successfully. This validation build intentionally has Drive unavailable because the desktop OAuth credentials are not configured in the current environment; a Drive-capable Windows build now requires both the real desktop client ID and its Google-generated desktop client secret at compile time.
- `bun test` — 113 pass, 0 fail, 637 assertions across 12 files after schema-v4 identity hardening.
- `cargo test --lib` in `src-tauri` — 22 pass, 0 fail after Windows desktop-client-secret exchange/refresh coverage.
- `rustfmt --edition 2021 --check src/commands/google_drive.rs` — passes. Repository-wide `cargo fmt -- --check` still fails on pre-existing unrelated Rust formatting, so no unrelated files were rewritten.
- `git diff --check` plus no-index checks for all 38 untracked files — pass (Git reports only expected Windows line-ending warnings).
- Focused size-boundary store suite — 12 pass, 128 assertions. A near-ceiling package stages and confirms; an oversized single operation creates no package/head/assignment state, keeps the pending operation intact, and fails safely again after close/reopen.
- Focused controller suite — 50 pass, 222 assertions. Remote list/download retries stop after three attempts; pagination loops, conflicting anchors, digest-linked missing history, overlapping ranges, tampered envelopes, authenticated-filename mismatches, pairing-observed history deletion, direct/response-lost anchor-loss uploads, and non-quiescent reset all stop safely. Reauthorization preserves the vault identity; partially failed reset preserves local enrollment; successful reset removes the anchor first, sweeps late packages, and tears down local state only after verified quiet emptiness.
- Focused two-device convergence suite — 4 pass, 76 assertions. Two independent real SQLite reconciliation stores converge offline update/update and update/delete conflicts in both Windows-first and iPhone-first orders, reach identical domains/shadows/source heads with empty outboxes, and perform a final silent cycle. OAuth/encryption/native inventory/controller scheduling remain covered by their separate focused suites.
- `cargo clippy --lib` — completes successfully. The Google Drive-specific style warning was cleaned up; 12 non-fatal warnings remain in pre-existing unrelated Rust files and no correctness warning was reported.
- Focused profile-isolation data suite — 14 pass, 63 assertions. It proves populated global whitelist/ghost values are not scanned, legacy encrypted preference history cannot mutate browser storage, and unknown preference keys remain rejected.
- Pairing rollback checkpoint — pairing-filter controller tests 10 pass (49 assertions); store and wire tests 16 pass (161 assertions). The unreleased `fgsync1` format now requires canonically sorted exporter-observed source heads, and durable schema-v3 rollback floors survive bootstrap interruption without being treated as apply receipts.
- Reset hardening checkpoint — controller suite 46 pass before the final cleanup refinement; the additional focused post-create anchor-loss regression passes (1 test, 6 assertions). Reset removes the anchor first, requires two quiet empty observations, retains local enrollment/key on failure, disconnects after verified success, and best-effort deletes a newly created package that cannot be confirmed against the anchor.
- Release workflow static checkpoint — Node's YAML parser accepts both workflow files and targeted routing checks pass. Both GitHub iOS paths require only the iOS OAuth ID, regenerate/link AuthenticationServices, merge the callback plist, and build with `custom-protocol`; Windows paths require the desktop OAuth ID and client secret. `actionlint`, Xcode, `xcodegen`, and `sh` remain unavailable on this host.
- Local IPA helper checkpoint — Git Bash `bash -n scripts/build-ios-ipa.sh` passes, and an invocation with an empty iOS OAuth ID exits immediately with the intended error before `tauri ios init` or any build mutation.
- Final bounded TypeScript hardening checkpoint — focused controller plus durable-device-ID suites pass 53 tests with 227 assertions; `npm run type-check` passes. Reauthorization preserves the enrolled vault identity, response-lost cleanup distinguishes absent from conflicting anchors, cleanup failure preserves the authoritative error/pending ledger, and cloud identity fails closed without durable storage.
- Store-bound identity checkpoint — schema v4 binds the cloud source ID per profile, backfills one pre-v4 local source from counter/outbox-only evidence, and carries one resolved ID through each controller operation. Focused store/controller/device-ID suites pass 75 tests with 408 assertions, the strengthened migration/store rerun passes 15 tests with 150 assertions, `npm run type-check` passes, and an independent read-only review found no P0/P1/P2 issue. The only noted gaps are non-blocking extra regressions for an ambiguous multi-source legacy fixture, explicit reset/disconnect row retention, and a single all-real-layers browser/store/controller test.
- Final bounded native hardening checkpoint — `cargo test --lib` passes 20 tests and `cargo clippy --lib` passes with the same 12 unrelated warnings. Every profile-scoped Drive command now requires the active authenticated Grindr profile; failed AES-GCM opens zeroize their working buffer; malformed desktop client-ID prefixes fail configuration validation. Tauri invoke names and renderer arguments remain unchanged.

## Known platform limits

- Xcode and the iOS SDK are unavailable on this Windows host. The Swift plugin, generated Xcode project, callback registration, signing, TrollStore installation, and real launch/resume OAuth flow still require macOS/CI and the iPhone.
- Neither OAuth client ID nor the Windows desktop client secret is configured in the current Windows shell. Both client-ID repository secret names were previously verified without revealing their values; the new `FREE_GRIND_GOOGLE_DESKTOP_CLIENT_SECRET` repository secret must be added before rebuilding. Google requires this generated Desktop-client value at the live token endpoint, but a native app cannot keep it confidential: it is extractable from the Windows executable and is not a security boundary. PKCE/state/TLS and protected refresh-token storage remain the security controls. iOS remains client-ID-only.
- `sh` is not on this host's PATH, but Git Bash is available by absolute path and validates the local IPA helper's shell syntax. Apple-specific commands and behavior still require their normal macOS/CI environment.
- Media transport is intentionally off. Inline base64 media can exceed the package ceiling and needs content-addressed encrypted blob routing before it can be enabled.
- Uploaded-history compaction is not implemented. Remote packages are intentionally retained so rollback/deletion checks remain strict.

## Final security/release review checkpoint discovered on 2026-09-01

- **Resolved:** no app-global `localStorage` preference is scanned or uploaded. Per-profile database settings still sync. Authenticated preference operations from prerelease histories are accepted only as mutation-free compatibility no-ops, while unknown keys remain rejected. Both installations must use the hardened build before enabling this unreleased feature; an older draft build can still publish its legacy globals.
- **Resolved:** fresh pairing codes commit every current exporter-observed source head. Import validates exact immutable packages before enabling the namespace, stores monotonic rollback floors before bootstrap/config writes, and enforces them after crashes/retries.
- **Resolved with conservative distributed semantics:** reset deletes the anchor first, repeatedly sweeps only the exact namespace, succeeds only after two quiet empty observations, and retains the local key/config if uploads do not quiesce. Established uploads validate the anchor around creation and best-effort remove the exact unconfirmed file if the post-create check fails. Drive offers no atomic multi-device namespace deletion, so the UI still correctly instructs the user to close/disconnect other devices and does not promise permanent mathematical absence.
- **Resolved:** disconnect/reset copy warns that losing the last local key without a retained pairing code can make remaining encrypted Drive data unreadable. A successful reset disconnects OAuth so the Windows authority returns to the ordinary Connect path and can create a fresh vault.
- **Statically resolved; platform validation remains:** both release workflows now require the appropriate platform OAuth configuration—Windows desktop ID plus generated client secret, iOS client ID only—and align iOS native authentication/Info.plist/custom-protocol steps. YAML parsing and routing checks pass on Windows; macOS CI must still prove generated-project/plugin compilation and IPA contents.
- **Resolved:** the local `build:ios:ipa` helper now fails immediately when `FREE_GRIND_GOOGLE_IOS_CLIENT_ID` is absent, preventing a release-style TrollStore IPA from silently omitting Drive capability. The generic development path may still run without Drive configured.

## Second final read-only audit findings on 2026-09-01

- No P0 finding was reported. The previously completed Windows matrix remains valid as a pre-fix checkpoint and must be rerun only after the bounded changes below.
- **P1 resolved:** connected devices always expose a Google sign-in refresh action backed by the existing connect flow. A regression proves the namespace, bootstrap identity, and vault key are preserved and no key create/import/delete operation occurs.
- **P2 resolved:** response-lost recovery deletes every exact authenticated deterministic candidate best-effort only when the required anchor is absent/revoked. Cleanup failure leaves the package pending and preserves the anchor error; a present conflicting anchor never triggers deletion.
- **P1 resolved:** the per-profile schema-v4 store binding is authoritative for Google Drive's local source identity. A missing browser value is repaired from the binding; a browser/store conflict preserves both values and stops before OAuth, key, namespace, bootstrap, reconciliation, or upload side effects. Migration binds exactly one legacy local-only counter/outbox source; ambiguous sources and enrolled unbound state without an existing browser ID fail closed instead of minting. Controller connect/export/import/cycle each resolve once and carry that ID through nested work. Reset/disconnect retain it, while manual backup keeps its existing best-effort fallback.
- **Native P2 resolved:** every profile-scoped Drive command is bound to the active authenticated Grindr session; failed decrypt buffers are zeroized; malformed desktop client-ID prefixes are rejected at configuration time.
- Accepted residual limitations, not current integrity blockers: immutable history is fully re-downloaded each cycle until safe compaction/change-token caching is designed; invalidation cannot abort every underlying native/network promise; pairing codes are non-expiring raw vault secrets; Drive reset has no atomic multi-device transaction.

## Exact next action

Do not repeat the completed audits, Windows matrix, OAuth provisioning, artifact inspection, backup verification, or failed authorization retries. The bounded Windows fix is committed locally as `f03dea40`; pushing it to `origin` is waiting only for the user's explicit approval of that GitHub destination. In Google Auth Platform -> Clients, verify that the Windows client is type Desktop app; if it is not, create a Desktop app client and replace `FREE_GRIND_GOOGLE_DESKTOP_CLIENT_ID`. Copy that same Desktop client's generated client secret directly into a new GitHub Actions repository secret named `FREE_GRIND_GOOGLE_DESKTOP_CLIENT_SECRET`; do not paste it into chat or source. After the commit is pushed and the secret exists, manually run the safe Windows+iOS test-artifact workflow, inspect the new Windows binary without exposing either credential, and switch from the currently running failed artifact under the same `free-grind` instance label. Complete one fresh Windows authorization and authoritative upload, then verify a real refresh before pairing the iPhone. Do not reveal a pairing code or install/pair the iPhone before Windows reports Up to date and Last successful sync is no longer Never. Keep media policy forced off and keep manual backup/import untouched.

## OAuth activation checkpoint completed on 2026-09-02

- GitHub lists both repository client-ID secret names: `FREE_GRIND_GOOGLE_DESKTOP_CLIENT_ID` and `FREE_GRIND_GOOGLE_IOS_CLIENT_ID`. Their values were neither read nor printed. The subsequently required Windows-only client-secret name is tracked in the 2026-09-03 diagnostic checkpoint below.
- An independent pre-commit audit found no real OAuth IDs, client secrets, private keys, tokens, generated binaries, or unrelated files in the implementation scope.
- The existing feature workflow was extended under read-only repository permissions to build and upload a Windows installer/executable alongside the unsigned iOS IPA. It has no release creation or OTA publication step.
- Both workflow files parse as YAML and `git diff --check` remains clean apart from expected Windows line-ending notices.
- GitHub Actions run `33638153247` completed successfully: unsigned iOS in 6m03s and credential-enabled Windows in 13m14s. It created no release and published no OTA data.
- Downloaded artifacts are stored under ignored directory `dist/google-drive-test-86a16ec9`: `free-grind-unsigned.ipa` (SHA-256 `E0CA7CECC40BF6BF1A141C6C0F853ACF25CDF9C7EE8C3F7B555FCD0567A43E05`) and portable `free-grind.exe` (SHA-256 `3AFBF73413A5768B8846AB28D172969756448EF3DE42B2FF7D45E16828FADA2B`).
- Artifact inspection confirms bundle ID `dev.estopia.free-grind`, iOS 17 compatibility, an unsigned TrollStore payload, required privacy descriptions, one callback scheme matching the embedded iOS client, one separate same-project desktop client, and Windows file/product version 0.5.3. Neither client ID value was printed.
- The Windows output is the portable child executable rather than an installer. The currently running authoritative app uses `src-tauri/target/release/free-grind.exe`; preserve its `free-grind` instance label when launching or replacing it for the real test.

## Real-account acceptance checkpoint started on 2026-09-03

- A new full-mode v2 manual export was created outside the repository before switching builds. A uniquely named safety copy preserves the original; both files are 412,932,773 bytes and have identical SHA-256 digests.
- A strict, non-mutating streaming validation parsed the header plus all 62,264 declared records. Every record was valid UTF-8/JSON, belonged to one of the seven declared sections, used an allowed table for that section, contained an object row, and exactly matched the per-section header counts.
- The old workspace `src-tauri/target/release/free-grind.exe` closed gracefully only after the backup passed. It was neither deleted nor overwritten.
- The credential-enabled CI artifact was launched with `--child --instance=free-grind`. Its runtime trace confirms child mode, label `free-grind`, and the existing authoritative data root under the `free-grind` instance.
- A read-only accessibility observation confirmed the new build opened as Free Grind, retained the authenticated laptop profile, and displayed the existing app data before the first Google authorization attempt.
- Windows screenshot capture remains unavailable for this transparent Tauri window, and accessibility activation of the Settings navigation is unreliable. The user must therefore make the next navigation/authentication action visibly; do not automate it blindly.
- The first real desktop authorization reached Google's consent service but returned `403 access_denied`: the external app is in Testing and the selected personal account is not an approved test user. The request itself used only `drive.appdata`, offline access, a loopback callback, and PKCE/S256 as designed. No pasted OAuth request identifiers or transient state were recorded here.

## Repeated Windows OAuth exchange failure diagnosed on 2026-09-03

- After the intended personal account was added as a test user, multiple prompt retries reached the valid loopback success page but the app remained disconnected with its sanitized reauthorization error. This ruled out the original tester gate and a single stale authorization attempt.
- A non-mutating diagnostic request sent an intentionally invalid code to Google's official token endpoint using the one client ID already embedded in the test binary. It sent no user authorization code, token, profile data, or client secret. Google returned HTTP 400 `invalid_request` with the actionable diagnosis that the desktop client secret was missing.
- The bounded fix requires a validated Windows-only `FREE_GRIND_GOOGLE_DESKTOP_CLIENT_SECRET`, resolves it before opening the browser, and adds it to both authorization-code exchange and refresh-token forms. It never enters the browser authorization URL, profile database, OS credential record, frontend, logs, iOS path, or iOS artifact.
- Both Windows CI paths now fail closed when either desktop credential is absent and pass the secret only to Windows validation/build steps. The iOS jobs contain no desktop-secret reference.
- Focused Google Drive native tests pass 14/14; the full native library passes 22/22; clippy passes with the same 12 pre-existing unrelated warnings; rustfmt, YAML parsing, workflow secret-routing assertions, and `git diff --check` pass. An independent read-only review found no P0/P1/P2 issue in the Windows secret handling or CI routing.
- The already-running test executable cannot be repaired by changing GitHub settings because its build-time configuration is immutable. A newly built Windows artifact is required. No failed attempt created an OAuth credential, encryption key, namespace, anchor, package, or Drive upload.
- The verified code/workflow fix is recorded in local commit `f03dea40` (`fix: authenticate Windows Google OAuth client [skip ci]`). Its push to `https://github.com/dm2mymcszt-commits/free-grind.git` was not performed because the host requires the user's explicit approval before transmitting repository contents to that remote.
