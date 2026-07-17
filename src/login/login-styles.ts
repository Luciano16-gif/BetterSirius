export const LOGIN_STYLES = `
  :root { color-scheme: light; }
  body[data-better-sirius-login-mode="enhanced"] { margin: 0 !important; overflow: hidden !important; }
  body[data-better-sirius-login-mode="enhanced"] [data-better-sirius-login-form="enhanced"] {
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147483000 !important;
    display: block !important;
    width: 100% !important;
    min-width: 0 !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: #f4f7fb !important;
    font-family: "Aptos", "Segoe UI", system-ui, sans-serif !important;
  }
  body[data-better-sirius-login-mode="enhanced"] [data-better-sirius-login-form="enhanced"] > :not([data-better-sirius-login-shell]) {
    display: none !important;
  }
  .bs-login-shell {
    display: grid;
    grid-template-columns: minmax(360px, 1.05fr) minmax(440px, .95fr);
    width: 100%;
    max-width: 100vw;
    min-height: 100dvh;
    overflow-x: hidden;
    color: #132f5d;
    background: #f4f7fb;
  }
  .bs-login-shell, .bs-login-shell *, .bs-login-shell *::before, .bs-login-shell *::after { box-sizing: border-box; }
  .bs-login-shell[hidden], .bs-login-return[hidden] { display: none !important; }
  .bs-login-story {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-width: 0;
    padding: clamp(28px, 4vw, 62px);
    overflow: hidden;
    color: #fff;
    background: #003087;
  }
  .bs-login-story::before {
    content: "";
    position: absolute;
    right: clamp(-140px, -8vw, -70px);
    bottom: clamp(-170px, -12vw, -90px);
    width: clamp(330px, 42vw, 640px);
    aspect-ratio: 1;
    border: 1px solid rgba(255,255,255,.15);
    border-radius: 50%;
    box-shadow: inset 0 0 0 58px rgba(255,255,255,.035), inset 0 0 0 118px rgba(246,134,41,.13);
    pointer-events: none;
  }
  .bs-login-story::after {
    content: "";
    position: absolute;
    top: 0;
    right: 12%;
    width: 4px;
    height: 23%;
    background: #f68629;
  }
  .bs-login-brand {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 13px;
    font-size: 17px;
    letter-spacing: -.02em;
  }
  .bs-login-brand-mark {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 11px;
    color: #003087;
    background: #f68629;
    font-weight: 850;
  }
  .bs-login-story-copy {
    position: relative;
    z-index: 1;
    max-width: 590px;
    padding: 80px 0;
  }
  .bs-login-story-eyebrow, .bs-login-eyebrow, .bs-login-edition {
    display: block;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .14em;
  }
  .bs-login-story-eyebrow { margin-bottom: 22px; color: #ffc18a; }
  .bs-login-story h1 {
    max-width: 570px;
    margin: 0;
    font-size: clamp(46px, 5.5vw, 78px);
    line-height: .96;
    letter-spacing: -.06em;
    font-weight: 690;
  }
  .bs-login-story p {
    max-width: 490px;
    margin: 26px 0 0;
    color: #c7d6ef;
    font-size: 16px;
    line-height: 1.65;
  }
  .bs-login-edition { position: relative; z-index: 1; color: #9eb6dd; }
  .bs-login-entry {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    width: 100%;
    padding: 94px clamp(28px, 5vw, 82px) 58px;
  }
  .bs-login-original {
    position: absolute;
    top: 30px;
    right: 34px;
    padding: 9px 0;
    border: 0;
    border-bottom: 1px solid #a9b6c8;
    color: #315177;
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: 720;
    cursor: pointer;
  }
  .bs-login-original:hover { color: #003087; border-color: #f68629; }
  .bs-login-card { width: min(100%, 430px); max-width: 100%; }
  .bs-login-eyebrow { margin-bottom: 15px; color: #c85e0b; }
  .bs-login-card h2 {
    margin: 0;
    color: #143363;
    font-size: clamp(38px, 4vw, 56px);
    line-height: 1;
    letter-spacing: -.055em;
    font-weight: 690;
  }
  .bs-login-intro { margin: 16px 0 34px; color: #66758a; font-size: 14px; line-height: 1.55; }
  .bs-login-error {
    margin: -12px 0 24px;
    padding: 12px 14px;
    border-left: 3px solid #d86212;
    color: #78350f;
    background: #fff0e4;
    font-size: 12px;
    line-height: 1.5;
  }
  .bs-login-field {
    display: grid;
    gap: 8px;
    margin-top: 19px;
    color: #19375f;
    font-size: 12px;
    font-weight: 760;
  }
  .bs-login-control-slot { display: block; }
  .bs-login-native-input {
    box-sizing: border-box !important;
    display: block !important;
    width: 100% !important;
    min-width: 0 !important;
    height: 50px !important;
    margin: 0 !important;
    padding: 0 14px !important;
    border: 1px solid #b9c4d2 !important;
    border-radius: 8px !important;
    color: #152d50 !important;
    background: #fff !important;
    box-shadow: none !important;
    outline: none !important;
    font: 500 16px/1 "Aptos", "Segoe UI", system-ui, sans-serif !important;
    transition: border-color .2s ease, box-shadow .2s ease !important;
  }
  .bs-login-native-input:hover { border-color: #8396af !important; }
  .bs-login-native-input:focus {
    border-color: #f68629 !important;
    box-shadow: 0 0 0 3px rgba(246,134,41,.17) !important;
  }
  .bs-login-submit-slot { margin-top: 28px; }
  .bs-login-native-submit {
    box-sizing: border-box !important;
    display: block !important;
    width: 100% !important;
    min-width: 0 !important;
    height: 50px !important;
    margin: 0 !important;
    padding: 0 18px !important;
    border: 1px solid #e66f17 !important;
    border-radius: 8px !important;
    color: #082c66 !important;
    background: #f68629 !important;
    box-shadow: 0 10px 28px rgba(159,76,14,.16) !important;
    font: 800 14px/1 "Aptos", "Segoe UI", system-ui, sans-serif !important;
    text-align: center !important;
    cursor: pointer !important;
    transition: transform .2s ease, background-color .2s ease, box-shadow .2s ease !important;
  }
  .bs-login-native-submit:hover { background: #ff963f !important; }
  .bs-login-native-submit:active { transform: translateY(1px) !important; box-shadow: 0 6px 16px rgba(159,76,14,.16) !important; }
  .bs-login-privacy { margin: 17px 0 0; color: #748297; font-size: 11px; line-height: 1.5; }
  .bs-login-return {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 2147483646;
    min-height: 44px;
    padding: 0 17px;
    border: 1px solid #e66f17;
    border-radius: 9px;
    color: #003087;
    background: #f68629;
    box-shadow: 0 12px 28px rgba(124,52,5,.2);
    font: 780 12px/1 "Aptos", "Segoe UI", system-ui, sans-serif;
    cursor: pointer;
  }
  @media (max-width: 760px) {
    body[data-better-sirius-login-mode="enhanced"] [data-better-sirius-login-form="enhanced"] {
      height: 100dvh !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
    }
    .bs-login-shell { display: block; min-height: 100dvh; }
    .bs-login-story { min-height: 224px; padding: max(24px, env(safe-area-inset-top)) 20px 30px; }
    .bs-login-story::before { right: -160px; bottom: -190px; width: 340px; }
    .bs-login-brand { font-size: 14px; }
    .bs-login-brand-mark { width: 34px; height: 34px; border-radius: 9px; }
    .bs-login-story-copy { padding: 36px 0 0; }
    .bs-login-story-eyebrow { margin-bottom: 12px; font-size: 9px; }
    .bs-login-story h1 { max-width: 345px; font-size: 34px; line-height: 1.01; overflow-wrap: anywhere; }
    .bs-login-story p, .bs-login-edition { display: none; }
    .bs-login-entry { display: block; width: 100%; min-width: 0; padding: 28px 20px max(48px, env(safe-area-inset-bottom)); }
    .bs-login-original { position: static; display: block; max-width: 100%; margin: 0 0 34px auto; }
    .bs-login-card { width: 100%; }
    .bs-login-card h2 { font-size: 36px; }
    .bs-login-intro { margin-bottom: 29px; }
  }
  @media (max-width: 380px) {
    .bs-login-story { min-height: 210px; padding-inline: 16px; }
    .bs-login-story h1 { font-size: 30px; }
    .bs-login-entry { padding-inline: 16px; }
    .bs-login-card h2 { font-size: 32px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .bs-login-native-input, .bs-login-native-submit { transition-duration: .01ms !important; }
  }
`;
