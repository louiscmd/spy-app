"use client"
import { useState } from "react"

type CipherType = "caesar" | "atbash" | "morse" | "xor" | "base64"

const MORSE: Record<string, string> = {A:".-",B:"-...",C:"-.-.",D:"-..",E:".",F:"..-.",G:"--.",H:"....",I:"..",J:".---",K:"-.-",L:".-..",M:"--",N:"-.",O:"---",P:".--.",Q:"--.-",R:".-.",S:"...",T:"-",U:"..-",V:"...-",W:".--",X:"-..-",Y:"-.--",Z:"--..",0:"-----",1:".----",2:"..---",3:"...--",4:"....-",5:".....",6:"-....",7:"--...",8:"---..",9:"----."}
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k,v])=>[v,k]))

function caesar(text: string, shift: number, decode: boolean) {
  const s = decode ? (26 - shift) % 26 : shift
  return text.toUpperCase().split("").map(c => {
    const code = c.charCodeAt(0)
    if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + s) % 26) + 65)
    return c
  }).join("")
}

function atbash(text: string) {
  return text.toUpperCase().split("").map(c => {
    const code = c.charCodeAt(0)
    if (code >= 65 && code <= 90) return String.fromCharCode(90 - (code - 65))
    return c
  }).join("")
}

function toMorse(text: string) {
  return text.toUpperCase().split("").map(c => c === " " ? "/" : MORSE[c] ?? c).join(" ")
}

function fromMorse(text: string) {
  return text.split(" / ").map(w => w.split(" ").map(s => MORSE_REV[s] ?? "?").join("")).join(" ")
}

function xorCipher(text: string, key: string, decode: boolean) {
  if (decode) {
    try {
      const decoded = atob(text)
      return decoded.split("").map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join("")
    } catch { return "[INVALID INPUT]" }
  }
  const encrypted = text.split("").map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join("")
  return btoa(encrypted)
}

export default function CipherPage() {
  const [input, setInput] = useState("")
  const [output, setOutput] = useState("")
  const [mode, setMode] = useState<"encode" | "decode">("encode")
  const [cipher, setCipher] = useState<CipherType>("caesar")
  const [shift, setShift] = useState(13)
  const [key, setKey] = useState("SPYAPP")
  const [copied, setCopied] = useState(false)

  function process() {
    const decode = mode === "decode"
    switch (cipher) {
      case "caesar": setOutput(caesar(input, shift, decode)); break
      case "atbash": setOutput(atbash(input)); break
      case "morse": setOutput(decode ? fromMorse(input) : toMorse(input)); break
      case "xor": setOutput(xorCipher(input, key, decode)); break
      case "base64": setOutput(decode ? (() => { try { return atob(input) } catch { return "[INVALID]" } })() : btoa(input)); break
    }
  }

  function copy() {
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="p-6 max-w-3xl">
      <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">Encryption Tools</p>
      <h1 className="text-xl font-semibold text-gray-100 mb-6">Cipher Tool</h1>

      <div className="card p-5 mb-4">
        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          {(["encode","decode"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`btn text-xs px-4 py-2 uppercase tracking-wider ${mode === m ? "btn-silver" : "btn-ghost"}`}>{m}</button>
          ))}
        </div>

        {/* Cipher selector */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
          {([["caesar","Caesar"],["atbash","Atbash"],["morse","Morse"],["xor","XOR"],["base64","Base64"]] as [CipherType, string][]).map(([c, label]) => (
            <button key={c} onClick={() => setCipher(c)}
              className={`btn text-xs px-2 py-2 justify-center uppercase tracking-wide ${cipher === c ? "btn-silver" : "btn-ghost"}`}>{label}</button>
          ))}
        </div>

        {/* Options */}
        {cipher === "caesar" && (
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-gray-600 uppercase tracking-wider">Shift</span>
            <input type="range" min={1} max={25} value={shift} onChange={e => setShift(+e.target.value)} className="flex-1 h-1 accent-gray-500" />
            <span className="text-sm text-gray-400 w-6 text-right font-mono">{shift}</span>
          </div>
        )}
        {cipher === "xor" && (
          <div className="mb-4">
            <label className="text-xs text-gray-600 uppercase tracking-wider block mb-1.5">Key</label>
            <input className="input" placeholder="Secret key" value={key} onChange={e => setKey(e.target.value)} />
          </div>
        )}

        {/* Input */}
        <div className="mb-3">
          <label className="text-xs text-gray-600 uppercase tracking-wider block mb-1.5">Input</label>
          <textarea rows={4} className="input font-mono text-sm resize-none" placeholder={mode === "encode" ? "Enter plaintext…" : "Enter ciphertext…"}
            value={input} onChange={e => setInput(e.target.value)} />
        </div>

        <button onClick={process} disabled={!input}
          className="btn btn-silver w-full justify-center text-xs uppercase tracking-wider mb-4">
          {mode === "encode" ? "Encrypt ▶" : "Decrypt ▶"}
        </button>

        {/* Output */}
        {output && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-600 uppercase tracking-wider">Output</label>
              <button onClick={copy} className="text-xs text-gray-600 hover:text-gray-300 transition-colors">{copied ? "Copied ✓" : "Copy"}</button>
            </div>
            <div className="bg-[#050505] border border-[#1a1a1a] rounded-md p-3 font-mono text-sm text-green-400 break-all min-h-[60px] whitespace-pre-wrap">
              {output}
            </div>
          </div>
        )}
      </div>

      {/* Cipher info */}
      <div className="card p-4 text-xs text-gray-600 space-y-1">
        {cipher === "caesar" && <p><span className="text-gray-500">Caesar cipher:</span> Shifts each letter by {shift} positions. Classic spy method. ROT-13 uses shift 13.</p>}
        {cipher === "atbash" && <p><span className="text-gray-500">Atbash cipher:</span> Mirrors the alphabet — A↔Z, B↔Y, etc. Symmetric: encode = decode.</p>}
        {cipher === "morse" && <p><span className="text-gray-500">Morse code:</span> Dots and dashes. Separate letters with spaces, words with " / ".</p>}
        {cipher === "xor" && <p><span className="text-gray-500">XOR cipher:</span> Encrypts with a repeating key using XOR. Output is Base64-encoded. Share the key securely.</p>}
        {cipher === "base64" && <p><span className="text-gray-500">Base64:</span> Encodes binary data as ASCII. Not encryption — easily reversed without a key.</p>}
      </div>
    </div>
  )
}
