const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\auth\\pages\\LoginPage.jsx";

let content = fs.readFileSync(targetFile, "utf8");

// ── 1. Update handleSubmit in LoginPage.jsx ──
const oldHandleSubmit = `    try {
      const loggedUser = await signIn({
        email: normalizeEmail(form.email),
        password: form.password,
        remember: form.remember,
        role: "student",
      });
      setShowSuccessBanner(true);
      setTimeout(() => {
        const dest = loggedUser?.role === "tridin" ? PATHS.TRIDIN_DASHBOARD : redirectTo;
        navigate(dest, {
          replace: true,
        });
      }, 3000);
    } catch (err) {`;

const newHandleSubmit = `    try {
      const loggedUser = await signIn({
        email: normalizeEmail(form.email),
        password: form.password,
        remember: form.remember,
        role: "student",
      });

      // If user is Tridin candidate, immediately navigate to Tridin dashboard without showing Welcome splash screen
      if (loggedUser?.role === "tridin") {
        navigate(PATHS.TRIDIN_DASHBOARD, { replace: true });
        return;
      }

      setShowSuccessBanner(true);
      setTimeout(() => {
        navigate(redirectTo, {
          replace: true,
        });
      }, 3000);
    } catch (err) {`;

if (content.includes(oldHandleSubmit)) {
  content = content.replace(oldHandleSubmit, newHandleSubmit);
  console.log("1. Successfully updated handleSubmit to bypass Welcome screen for Tridin candidates!");
} else {
  console.log("Could not find exact oldHandleSubmit, searching by parts");
  const needle = 'setShowSuccessBanner(true);';
  const pos = content.indexOf(needle);
  if (pos !== -1) {
    const blockStart = content.lastIndexOf('const loggedUser = await signIn', pos);
    const blockEnd = content.indexOf('} catch (err) {', pos);
    if (blockStart !== -1 && blockEnd !== -1) {
      content = content.slice(0, blockStart) + newHandleSubmit.trim() + "\n    " + content.slice(blockEnd);
      console.log("1b. Replaced handleSubmit via slice!");
    }
  }
}

// ── 2. Guard showSuccessBanner rendering check ──
content = content.replace(
  'if (showSuccessBanner) {',
  'if (showSuccessBanner && userRole !== "tridin") {'
);

// ── 3. Guard isAuthenticated check ──
content = content.replace(
  'if (isAuthenticated && !showSuccessBanner) {',
  'if (isAuthenticated && (userRole === "tridin" || !showSuccessBanner)) {'
);

fs.writeFileSync(targetFile, content, "utf8");
console.log("Successfully updated D:\\lurnstack\\LurnStack\\src\\auth\\pages\\LoginPage.jsx!");
