const { renderCampaignHtml } = require("../src/services/emailService");

const runTests = () => {
  console.log("--- Starting Extended Logo Rendering Tests ---");

  // Test 1: showLogo = false (logo should not render)
  const campaignNoLogo = {
    showLogo: false,
    theme: "light",
    logoAlt: "My Logo",
    logoUrl: "http://example.com/logo.png"
  };
  const htmlNoLogo = renderCampaignHtml(campaignNoLogo);
  if (htmlNoLogo.includes("<img") && htmlNoLogo.includes("example.com")) {
    throw new Error("Test 1 Failed: Logo should not render when showLogo is false!");
  }
  console.log("✓ Test 1 Passed: Logo is skipped when showLogo is false.");

  // Test 2: logoUrl is present (should render logo with exact styles)
  const campaignCustomLogo = {
    showLogo: true,
    theme: "light",
    logoAlt: "Custom Brand Logo",
    logoUrl: "https://my-app.com/assets/logo.png"
  };
  const htmlCustomLogo = renderCampaignHtml(campaignCustomLogo);
  const expectedTag = `<img src="https://my-app.com/assets/logo.png" alt="Custom Brand Logo" style="display:block;width:150px;max-width:48%;height:auto;">`;
  if (!htmlCustomLogo.includes(expectedTag)) {
    throw new Error("Test 2 Failed: Custom logo image tag not found with correct styles!\nRendered: " + htmlCustomLogo);
  }
  console.log("✓ Test 2 Passed: Custom logoUrl rendered with exact style attributes.");

  // Test 3: localhost logoUrl (should resolve to public api base)
  const campaignLocalhostLogo = {
    showLogo: true,
    theme: "light",
    logoAlt: "Local Dev Logo",
    logoUrl: "http://localhost:3000/static/my-logo.png"
  };
  const htmlLocalhostLogo = renderCampaignHtml(campaignLocalhostLogo);
  if (htmlLocalhostLogo.includes("localhost:3000")) {
    throw new Error("Test 3 Failed: Localhost was not replaced with public server url!");
  }
  if (!htmlLocalhostLogo.includes("https://api.lurnstack.com/static/my-logo.png")) {
    throw new Error("Test 3 Failed: Correct replaced absolute URL not found!");
  }
  console.log("✓ Test 3 Passed: Localhost logoUrl resolved to absolute public URL.");

  // Test 4: React source path / src assets logoUrl (should map to backend static uploaded file)
  const campaignReactLogo = {
    showLogo: true,
    theme: "light",
    logoAlt: "React Source Logo",
    logoUrl: "src/assets/Logo/Logo4.png"
  };
  const htmlReactLogo = renderCampaignHtml(campaignReactLogo);
  if (htmlReactLogo.includes("src/assets")) {
    throw new Error("Test 4 Failed: React source path was not cleaned!");
  }
  if (!htmlReactLogo.includes("https://api.lurnstack.com/uploads/Logo4.png")) {
    throw new Error("Test 4 Failed: React source path was not resolved to backend uploads!");
  }
  console.log("✓ Test 4 Passed: React source/assets paths resolved to backend uploads.");

  // Test 5: logoUrl is empty & dark theme (should use Logo3.png)
  const campaignEmptyDarkLogo = {
    showLogo: true,
    theme: "dark",
    logoAlt: "Dark Theme Logo",
    logoUrl: ""
  };
  const htmlEmptyDarkLogo = renderCampaignHtml(campaignEmptyDarkLogo);
  if (!htmlEmptyDarkLogo.includes("https://api.lurnstack.com/uploads/Logo3.png")) {
    throw new Error("Test 5 Failed: Dark theme did not fallback to Logo3.png!");
  }
  console.log("✓ Test 5 Passed: Empty logoUrl on dark theme resolved to Logo3.png.");

  // Test 6: logoUrl is empty & light theme (should use Logo4.png)
  const campaignEmptyLightLogo = {
    showLogo: true,
    theme: "light",
    logoAlt: "Light Theme Logo",
    logoUrl: null
  };
  const htmlEmptyLightLogo = renderCampaignHtml(campaignEmptyLightLogo);
  if (!htmlEmptyLightLogo.includes("https://api.lurnstack.com/uploads/Logo4.png")) {
    throw new Error("Test 6 Failed: Light theme did not fallback to Logo4.png!");
  }
  console.log("✓ Test 6 Passed: Empty logoUrl on light theme resolved to Logo4.png.");

  // Test 7: Footer Regards text (should show "Team Tamil Info Technology")
  const campaignSessionIntimation = {
    showLogo: true,
    theme: "light",
    templateType: "session_intimation",
    logoAlt: "Standard Logo",
    logoUrl: "",
    heading: "Session Alert",
    offerTitle: "Math Class",
    body: "Be there."
  };
  const htmlSessionIntimation = renderCampaignHtml(campaignSessionIntimation);
  if (!htmlSessionIntimation.includes("Team Tamil Info Technology")) {
    throw new Error("Test 7 Failed: Footer regards text does not contain 'Team Tamil Info Technology'!");
  }
  console.log("✓ Test 7 Passed: Regards block shows 'Team Tamil Info Technology' correctly.");

  console.log("\n--- All Logo Rendering Tests Passed Successfully! ---");
};

try {
  runTests();
} catch (error) {
  console.error("Test execution failed:", error);
  process.exit(1);
}
