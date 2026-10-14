const fs = require("fs");
const path = require("path");

const adminRoot = "D:\\ADMIN\\LurnStack-Admin";

// ── 1. Create tridinCandidatesApi.js ──
const apiFilePath = path.join(adminRoot, "src", "api", "tridinCandidatesApi.js");
const apiCode = `import { axiosClient } from './axiosClient';

const TRIDIN_CANDIDATES_ENDPOINT = '/api/tridin/admin/candidates';
const ADMIN_TRIDIN_ENDPOINT = '/api/admin/tridin/candidates';

export const fetchTridinCandidates = async () => {
  try {
    const response = await axiosClient.get(TRIDIN_CANDIDATES_ENDPOINT);
    return response.data;
  } catch (err) {
    const fallback = await axiosClient.get(ADMIN_TRIDIN_ENDPOINT);
    return fallback.data;
  }
};

export const createTridinCandidate = async (payload) => {
  try {
    const response = await axiosClient.post(TRIDIN_CANDIDATES_ENDPOINT, payload);
    return response.data;
  } catch (err) {
    const fallback = await axiosClient.post(ADMIN_TRIDIN_ENDPOINT, payload);
    return fallback.data;
  }
};

export const deleteTridinCandidate = async (candidateId) => {
  try {
    const response = await axiosClient.delete(\`\${TRIDIN_CANDIDATES_ENDPOINT}/\${candidateId}\`);
    return response.data;
  } catch (err) {
    const fallback = await axiosClient.delete(\`\${ADMIN_TRIDIN_ENDPOINT}/\${candidateId}\`);
    return fallback.data;
  }
};
`;

fs.writeFileSync(apiFilePath, apiCode, "utf8");
console.log("Created:", apiFilePath);

// ── 2. Create CreateCandidateModal.jsx ──
const modalFilePath = path.join(adminRoot, "src", "components", "CreateCandidateModal.jsx");
const modalCode = `import React, { useState, useEffect } from "react";
import { Key, Sparkles, X, Eye, EyeOff, Copy, Check, ShieldCheck, AlertCircle } from "lucide-react";

export default function CreateCandidateModal({ isOpen, onClose, onSuccess }) {
  const [candidateId, setCandidateId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [jobRole, setJobRole] = useState("Software Engineer");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Helper: Generate secure Tridin password e.g. Tridin@2026-6448
  const generatePassword = () => {
    const year = new Date().getFullYear();
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const newPass = \`Tridin@\${year}-\${randomDigits}\`;
    setPassword(newPass);
    return newPass;
  };

  // Helper: Auto-suggest Candidate ID
  const generateCandidateId = () => {
    const randomNum = Math.floor(100 + Math.random() * 900);
    return \`TRD-\${randomNum}\`;
  };

  useEffect(() => {
    if (isOpen) {
      setCandidateId(generateCandidateId());
      generatePassword();
      setFullName("");
      setEmail("");
      setPhoneNumber("");
      setJobRole("Software Engineer");
      setError("");
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyPassword = () => {
    if (!password) return;
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Candidate Full Name is required.");
      return;
    }
    if (!email.trim()) {
      setError("Candidate Email is required.");
      return;
    }
    if (!password.trim()) {
      setError("Password is required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await onSuccess({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password: password.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        candidateId: candidateId.trim() || undefined,
        jobRole: jobRole.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to create candidate.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-[#09111e] border border-blue-900/40 text-gray-100 shadow-2xl">
        {/* Top Header */}
        <div className="flex items-start justify-between border-b border-gray-800/80 px-6 py-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-inner">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white tracking-tight">
                Create Candidate Login Credentials
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Generate Candidate ID & password for new candidate learning portal access.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Row 1: Candidate ID, Full Name, Email */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-gray-300 mb-1.5">
                Candidate ID
              </label>
              <input
                type="text"
                placeholder="e.g. TRD-001 (Optional)"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                className="w-full rounded-xl border border-gray-800 bg-[#0d1829] px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-gray-300 mb-1.5">
                Candidate Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="Enter candidate full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-gray-800 bg-[#0d1829] px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-gray-300 mb-1.5">
                Candidate Email (Username) *
              </label>
              <input
                type="email"
                required
                placeholder="candidate@tridinsoftware.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-800 bg-[#0d1829] px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Row 2: Phone Number & Target Job Role */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-gray-300 mb-1.5">
                Phone Number
              </label>
              <input
                type="text"
                placeholder="+91 98765 43210"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full rounded-xl border border-gray-800 bg-[#0d1829] px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-gray-300 mb-1.5">
                Target Job Role
              </label>
              <input
                type="text"
                placeholder="Software Engineer"
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                className="w-full rounded-xl border border-gray-800 bg-[#0d1829] px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Row 3: Onboarding Login Password with Auto-Generate */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-gray-300">
                Onboarding Login Password *
              </label>
              <button
                type="button"
                onClick={generatePassword}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Generate Password</span>
              </button>
            </div>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter or generate password"
                className="w-full rounded-xl border border-gray-800 bg-[#0d1829] pl-3.5 pr-20 py-2.5 text-xs font-mono font-bold text-cyan-300 focus:border-cyan-500 focus:outline-none transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="rounded-lg p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="rounded-lg p-1.5 text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors"
                  title="Copy password"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Candidate will use this email and password to log in at the LurnStack Candidate Portal.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-gray-700 bg-gray-800/80 px-5 py-2 text-xs font-bold text-gray-300 hover:bg-gray-700 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-2.5 text-xs font-black text-white hover:from-blue-500 hover:to-cyan-400 active:scale-[0.98] transition-all shadow-lg shadow-cyan-900/30 disabled:opacity-50"
            >
              <Key className="h-4 w-4" />
              <span>{loading ? "Creating & Syncing..." : "Create & Issue Credentials"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(modalFilePath, modalCode, "utf8");
console.log("Created:", modalFilePath);

// ── 3. Create TridinCandidates.jsx Page ──
const tridinDir = path.join(adminRoot, "src", "pages", "tridin");
if (!fs.existsSync(tridinDir)) fs.mkdirSync(tridinDir, { recursive: true });

const pageFilePath = path.join(tridinDir, "TridinCandidates.jsx");
const pageCode = `import React, { useEffect, useState, useMemo } from "react";
import {
  Key,
  Users,
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import {
  fetchTridinCandidates,
  createTridinCandidate,
  deleteTridinCandidate,
} from "../../api/tridinCandidatesApi";
import CreateCandidateModal from "../../components/CreateCandidateModal";
import ErrorBanner from "../../components/ErrorBanner";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function TridinCandidates() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Success Credential Preview Card State
  const [newlyCreated, setNewlyCreated] = useState(null);
  const [copiedField, setCopiedField] = useState("");

  const loadCandidates = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchTridinCandidates();
      const list = Array.isArray(res?.data) ? res.data : [];
      setCandidates(list);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load Tridin candidates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, []);

  const handleCreateSuccess = async (payload) => {
    const res = await createTridinCandidate(payload);
    // Reload candidates list
    await loadCandidates();
    // Show credentials card so Admin can copy
    setNewlyCreated({
      fullName: payload.fullName,
      email: payload.email,
      password: payload.password,
      phoneNumber: payload.phoneNumber,
      candidateId: payload.candidateId,
      jobRole: payload.jobRole,
    });
  };

  const handleDelete = async (candidateId) => {
    setDeletingId(candidateId);
    try {
      await deleteTridinCandidate(candidateId);
      setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
      setDeleteConfirmId(null);
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to delete candidate.");
    } finally {
      setDeletingId(null);
    }
  };

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(""), 2000);
  };

  const filteredCandidates = useMemo(() => {
    if (!searchTerm.trim()) return candidates;
    const query = searchTerm.toLowerCase();
    return candidates.filter(
      (c) =>
        c.fullName?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query) ||
        c.phoneNumber?.includes(query)
    );
  }, [candidates, searchTerm]);

  return (
    <div className="space-y-6 animate-fade-in p-6 max-w-7xl mx-auto">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Key className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">
                Tridin Candidate Credentials
              </h1>
              <span className="rounded-full bg-cyan-950/80 border border-cyan-500/40 px-2.5 py-0.5 text-[10px] font-black uppercase text-cyan-300">
                LMS Access
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Issue secure email & password credentials for Tridin Track candidates to access LurnStack.
            </p>
          </div>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-2.5 text-xs font-black text-white hover:from-blue-500 hover:to-cyan-400 active:scale-95 transition-all shadow-lg shadow-cyan-900/40"
        >
          <Plus className="h-4 w-4" />
          <span>+ Create Candidate Credentials</span>
        </button>
      </div>

      {/* ── Newly Created Credentials Banner (If available) ── */}
      {newlyCreated && (
        <div className="relative rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/60 to-gray-900 p-6 shadow-xl animate-in slide-in-from-top">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-emerald-300">
                  Candidate Credentials Successfully Generated & Synced to Database!
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  Share these login credentials with candidate: {newlyCreated.fullName}
                </p>
              </div>
            </div>

            <button
              onClick={() => setNewlyCreated(null)}
              className="text-xs text-gray-400 hover:text-white"
            >
              ✕ Dismiss
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-gray-950/80 p-4 rounded-xl border border-gray-800">
            <div>
              <span className="text-[10px] font-black uppercase text-gray-400">Portal URL</span>
              <p className="text-xs font-bold text-gray-200 mt-0.5">lurnstack.com/login</p>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-gray-400">Candidate Email</span>
              <p className="text-xs font-bold text-cyan-300 mt-0.5 truncate">{newlyCreated.email}</p>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-gray-400">Login Password</span>
              <p className="text-xs font-mono font-bold text-emerald-400 mt-0.5">{newlyCreated.password}</p>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  const text = \`LurnStack Tridin Candidate Login Credentials:\\nName: \${newlyCreated.fullName}\\nEmail: \${newlyCreated.email}\\nPassword: \${newlyCreated.password}\\nLogin URL: https://lurnstack.com/login\`;
                  copyToClipboard(text, "all");
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition-all"
              >
                {copiedField === "all" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedField === "all" ? "Copied!" : "Copy All Credentials"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-5 shadow-sm">
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-400">
            Total Tridin Candidates
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{candidates.length}</span>
            <span className="text-xs font-semibold text-cyan-400">registered</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-5 shadow-sm">
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-400">
            Active LMS Accounts
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">
              {candidates.filter((c) => c.isActive !== false).length}
            </span>
            <span className="text-xs font-semibold text-gray-400">can access dashboard</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-5 shadow-sm">
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-400">
            Role Type in DB
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-sm font-black font-mono text-cyan-300">TRIDIN_CANDIDATE</span>
          </div>
        </div>
      </div>

      {/* ── Search & Filter ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-900/60 border border-gray-800/80 p-4 rounded-xl">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-800 bg-gray-950 pl-10 pr-3.5 py-2 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <button
          onClick={loadCandidates}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-800 bg-gray-800/60 px-3.5 py-2 text-xs font-semibold text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className={\`h-3.5 w-3.5 \${loading ? "animate-spin" : ""}\`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

      {/* ── Candidates Table ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-xl">
        {loading ? (
          <div className="py-16 text-center">
            <LoadingSpinner />
            <p className="mt-3 text-xs text-gray-400 font-semibold">Loading Tridin Candidates...</p>
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="py-16 text-center text-gray-400 space-y-3">
            <Users className="mx-auto h-12 w-12 text-gray-600" />
            <p className="text-sm font-bold text-gray-300">No Tridin Candidates Found</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Click "+ Create Candidate Credentials" to register a candidate with email & password.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="border-b border-gray-800 bg-gray-950/80 text-[11px] font-black uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-6 py-4">Candidate Name</th>
                  <th className="px-6 py-4">Email / Login Username</th>
                  <th className="px-6 py-4">Phone Number</th>
                  <th className="px-6 py-4">Role Badge</th>
                  <th className="px-6 py-4">Joined Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filteredCandidates.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 font-black text-xs border border-cyan-500/30">
                          {c.fullName ? c.fullName[0].toUpperCase() : "T"}
                        </div>
                        <div>
                          <span className="font-bold text-white block">{c.fullName}</span>
                          <span className="text-[10px] text-gray-500">ID: #{c.id}</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-cyan-300">{c.email}</span>
                        <button
                          onClick={() => copyToClipboard(c.email, \`email-\${c.id}\`)}
                          className="text-gray-500 hover:text-cyan-400"
                          title="Copy Email"
                        >
                          {copiedField === \`email-\${c.id}\` ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-gray-400">
                      {c.phoneNumber || "—"}
                    </td>

                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-950 border border-cyan-500/30 px-2.5 py-0.5 text-[10px] font-black text-cyan-300">
                        <ShieldCheck className="h-3 w-3" />
                        <span>TRIDIN CANDIDATE</span>
                      </span>
                    </td>

                    <td className="px-6 py-4 text-gray-400">
                      {c.createdAt
                        ? new Date(c.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {deleteConfirmId === c.id ? (
                        <div className="inline-flex items-center gap-2">
                          <span className="text-[10px] text-red-400 font-bold">Sure?</span>
                          <button
                            onClick={() => handleDelete(c.id)}
                            disabled={deletingId === c.id}
                            className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-500"
                          >
                            {deletingId === c.id ? "..." : "Delete"}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] font-bold text-gray-300 hover:bg-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(c.id)}
                          className="rounded-lg border border-gray-800 bg-gray-800/60 p-1.5 text-gray-400 hover:text-red-400 hover:border-red-900/40 hover:bg-red-950/20 transition-all"
                          title="Delete Candidate Account"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      <CreateCandidateModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
`;

fs.writeFileSync(pageFilePath, pageCode, "utf8");
console.log("Created:", pageFilePath);

console.log("Files generated successfully!");
