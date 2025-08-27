# LoremIpsum: "Answer‑Paster" for Philosophy  

> *Extension that helps with Daigler, you can essentially focus on the newer questions by "pasting" your previous answers automatically from previous quiz attempts*

## 🌐 Community
**Join our Discord for suggestions and feedback:** [https://discord.gg/n6fKsUkuXP](https://discord.gg/n6fKsUkuXP)

---

> **Note:** This tool should only be used if you are confident that your answers from previous assessments are correct.  
> If you want to improve your score, it's best to consult your philosophy professor about which questions you got wrong and address those manually.


## ⚙️ Features

### What it does
- **Answer‑Paster**: Quickly pastes saved answers from your previous assessments into the current quiz page
- **Smart matching**: Works with single/multiple‑choice; uses question IDs and extracted data
- **Presets**: Save answers per quiz, reuse them later, and switch between quizzes
- **Import/Export**: Move presets as JSON files (export from review, import before taking)

### Main feature
- Stores presets in the browser via `localStorage` under a hostname‑scoped key
- Lets you extract answers on review pages, export them as JSON, and import later
- Pastes values directly into inputs; it does not simulate keystrokes

---

## 📥 Installation

1. **Download** this folder to your machine
2. **Open** Chrome → Extensions → enable Developer Mode
3. **Click** "Load unpacked" and select the project folder
4. **Verify** the extension appears with the provided icon

---

## 🔨 Usage

1. **Navigate** to a Philo quiz
2. **Wait** for the tool to open automatically
3. **Import** preset JSON when prompted (or via UI) and apply
4. **Extract** and export presets on review pages for reuse

---

## ⌨️ Keyboard Shortcuts
*Options modal commands:*

| Key | Action |
|-----|--------|
| **Esc** | Close the modal |
| **Ctrl + R** | Refresh tool status |
| **Ctrl + I** | Show extension info in the console |
| **Arrow Keys** | Navigate sections in the options modal |

---

## 🔧 Troubleshooting

### Common Issues
- **Wrong quiz selected?** The selected quiz name is persisted; switch it in the UI or clear it
- **Reset presets**: Open DevTools → Application → Storage → Local Storage → remove keys starting with `ttf_presets_` for the site
- **Still stuck?** Check the console for logs from "TTF"/"LoremIpsum" to see what the script is doing, if there are errors feel free to send it

---

## 📁 File Overview

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest, permissions, and options page wiring |
| `background.js` | Injects the content script on ADDU quiz/review pages; opens the options page |
| `content.js` | Main logic — UI panel, answer‑pasting, preset load/save, import/export, extraction on review pages |
| `options.html` / `options.js` | Clean modal UI with status, features, team credits, and shortcuts |

---

## 🔍 Technical Details
*How it works in a technical way will be explained soon... For now, you may check the source code if you wish to understand the implementation in detail.*

---

## 👥 Credits
- **AJ Krystle Castro**
- **Kevin Clark Kaslana**
- **Reynold Angelo C. Segundo**

---

## ⚠️ Disclaimer
For learning and productivity. Use responsibly and follow your Ateneo's policies.

---

## 📝 License
This project is licensed under the PolyForm Noncommercial License 1.0.0. See the [LICENSE](./LICENSE) file for details.