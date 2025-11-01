import React from "react";
import styles from "./Footer.module.css";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-black px-6 py-12">
      <div className="mx-auto max-w-[980px] text-xs text-white/50">
        <p>© {year} Stoix Protocol. All rights reserved.</p>
      </div>
    </footer>
  );
}

