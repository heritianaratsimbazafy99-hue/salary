"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
export function DepartedPayrollApproval({ importId, fingerprint }: { importId: string; fingerprint: string }) {
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  async function approve() {
    setBusy(true);
    try {
      const response=await fetch(`/api/hr/imports/${importId}/departure-approval`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirmed:true,fingerprint})});
      const body=await response.json(); if(!response.ok) throw new Error(body.error?.message??"Validation impossible.");
      setMessage("Cette version précise est validée. Le responsable peut publier ; toute modification pertinente exige une nouvelle validation.");
    } catch(error){setMessage(error instanceof Error?error.message:"Erreur réseau.");} finally{setBusy(false);}
  }
  return <div className="grid gap-3"><p>En confirmant, vous autorisez les fiches des salariés partis pour les lignes affichées. Cette validation ne réactive ni l’emploi ni l’accès.</p><Button disabled={busy} onClick={approve}>Valider cette version pour les salariés partis</Button>{message&&<p role="status">{message}</p>}</div>;
}
