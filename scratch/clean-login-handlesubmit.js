const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\auth\\pages\\LoginPage.jsx";

let content = fs.readFileSync(targetFile, "utf8");

const cleanHandleSubmit = `  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
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
    } catch (err) {
      setFormError(err?.message || "Unable to sign in.");
      setLoading(false);
    }
  };`;

// Replace from const handleSubmit = async (e) => { to const handleGoogleLogin
const start = content.indexOf("const handleSubmit = async (e) => {");
const end = content.indexOf("const handleGoogleLogin = () => {");

if (start !== -1 && end !== -1) {
  content = content.slice(0, start) + cleanHandleSubmit + "\n\n  " + content.slice(end);
  fs.writeFileSync(targetFile, content, "utf8");
  console.log("Cleaned up handleSubmit syntax in LoginPage.jsx successfully!");
} else {
  console.error("Could not find handleSubmit boundaries");
}
