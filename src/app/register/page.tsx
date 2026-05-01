"use client";

import { useState } from "react";

export default function RegisterPage() {
  const [companyName, setCompanyName] = useState("");
  const [companyType, setCompanyType] = useState("designer");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  async function submit() {
    if (!companyName || !contactName || !email) {
      alert("Company name, contact name and email are required.");
      return;
    }

    const res = await fetch("/api/register-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, companyType, contactName, email, phone }),
    }).then(r => r.json());

    if (res.error) {
      alert(res.error);
      return;
    }

    alert("Registration request submitted. Admin will approve and create login.");
    setCompanyName("");
    setContactName("");
    setEmail("");
    setPhone("");
  }

  return (
    <main style={{ padding: 24, maxWidth: 600, margin: "60px auto" }}>
      <a href="/login">← Back to Login</a>
      <h1>Request Company Registration</h1>

      <input placeholder="Company name" value={companyName} onChange={e => setCompanyName(e.target.value)} style={input} />

      <select value={companyType} onChange={e => setCompanyType(e.target.value)} style={input}>
        <option value="designer">Designer Company</option>
        <option value="client">Client / Approver Company</option>
      </select>

      <input placeholder="Contact person name" value={contactName} onChange={e => setContactName(e.target.value)} style={input} />
      <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={input} />
      <input placeholder="Phone optional" value={phone} onChange={e => setPhone(e.target.value)} style={input} />

      <button onClick={submit} style={button}>Submit Request</button>
    </main>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  marginBottom: 12,
  border: "1px solid #bbb",
  borderRadius: 8,
};

const button: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: 0,
  borderRadius: 8,
  background: "#111827",
  color: "white",
  fontWeight: 700,
};
