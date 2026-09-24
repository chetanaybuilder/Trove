"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: any;
  }
}

export default function GoogleSignIn() {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const render = () => {
      if (!ref.current || !window.google) return;
      ref.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: "584470434360-a2hr86d4km3odtu3blfb9r9pfqjmo3bv.apps.googleusercontent.com",
        callback: async ({ credential }: { credential: string }) => {
          try {
            const r = await fetch("/api/v1/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential })
            });
            if (!r.ok) throw new Error("Authentication failed");
            const data = await r.json();
            localStorage.setItem("trove_session", JSON.stringify(data));
            location.href = "/dashboard";
          } catch {
            setError("Google sign-in could not be completed.");
          }
        }
      });
      window.google.accounts.id.renderButton(ref.current, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 300
      });
    };
    if (window.google) render();
    window.addEventListener("google-ready", render);
    return () => window.removeEventListener("google-ready", render);
  }, []);

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive"
        onLoad={() => window.dispatchEvent(new Event("google-ready"))} />
      <div ref={ref} />
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </>
  );
}