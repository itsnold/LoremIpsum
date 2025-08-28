# Release Notes - LoremIpsum v1.0

## What's This?

This is the first stable release of LoremIpsum, a Chrome extension for ADDU philosophy quizzes. It automatically fills in answers from your previous quiz attempts so you can focus on new questions.

## What Works

- **Auto-fill answers**: Takes your saved answers and fills them into quiz forms automatically
- **Works on ADDU quiz pages**: Only runs on `*.addu.edu.ph` quiz and review pages  
- **Save answer sets**: You can save different sets of answers for different quizzes
- **Import/Export**: Move your saved answers between computers as JSON files
- **Extract from review pages**: When you finish a quiz, go to the review page to save all your answers

## How to Install

1. Download `LoremIpsum1.0.zip` 
2. Extract it somewhere on your computer
3. Go to `chrome://extensions/` in Chrome
4. Turn on "Developer mode" (top right toggle)
5. Click "Load unpacked" and pick the folder you extracted
6. Done - the extension icon should appear

## Technical Stuff

- Uses localStorage to save your answer presets
- Only needs permissions for ADDU quiz pages and local storage
- Directly fills form inputs (doesn't simulate typing)
- Has keyboard shortcuts for the options panel

## Who Made This

- AJ Krystle Castro
- Kevin Clark Kaslana  
- Reynold Angelo C. Segundo

## Important

This is for studying help, not cheating. Use it responsibly and follow your school's rules.

Got questions? Join the Discord: https://discord.gg/n6fKsUkuXP
