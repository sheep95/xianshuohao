"use client";
import { useState } from "react";
import { useTransitionRouter } from "./transition-link";
export function RoomEntry() {
  const router = useTransitionRouter();
  const [code, setCode] = useState("");
  return <details className="room-entry"><summary>已经有房间码？</summary><form onSubmit={(event) => { event.preventDefault(); router.push("/room/" + code.trim().toUpperCase()); }}><label className="text-field">房间码<input required pattern="[A-Za-z0-9]{10}" maxLength={10} value={code} onChange={(event) => setCode(event.target.value.trim().toUpperCase())} placeholder="10 位字母或数字" autoComplete="off" autoCapitalize="characters" /></label><button type="submit" className="secondary-button">进入房间</button></form></details>;
}

