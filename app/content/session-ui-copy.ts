import type { LocalizedText } from './python-session-1'

export interface SessionUiCopy {
  hubEyebrow: string
  hubTitle: string
  hubDescription: string
  hubAction: string
  hubStatus: string
  coursesLabel: string
  pythonCodingLabel: string
  masteredLabel: string
  comingSoonLabel: string
  moreJourneysTitle: string
  moreJourneysDescription: string
  lockedNowLabel: string
  sessionSettings: string
  language: string
  progression: string
  guided: string
  guidedHelp: string
  explore: string
  exploreHelp: string
  resetProgress: string
  progress: string
  current: string
  missionPreview: string
  stageReady: string
  chooseLevel: string
  objective: string
  missionSteps: string
  backToJourney: string
  sessionLevels: string
  resetConfirmation: string
  runExample: string
  continueToPredict: string
  checkPrediction: string
  continueToCode: string
  runCode: string
  continueToTest: string
  testCode: string
  codeInstruction: string
  testInstruction: string
  sampleTests: string
  noInput: string
  correct: string
  tryAgain: string
  hint: string
  showHint: string
  pass: string
  fail: string
  expected: string
  actual: string
  error: string
  noError: string
  runtimeLoading: string
  runtimeReady: string
  runtimeFailed: string
  executionStopped: string
  running: string
  testing: string
  masteryAchieved: string
  masteryHelp: string
}

export const sessionUiCopy: Record<'en' | 'th', SessionUiCopy> = {
  en: {
    hubEyebrow: 'LEARNING HUB', hubTitle: 'Choose your learning path', hubDescription: 'Start with small ideas and build your coding skills one Mission at a time.', hubAction: 'Open Python Session 1', hubStatus: 'Ready to start', coursesLabel: 'Courses', pythonCodingLabel: 'PYTHON CODING', masteredLabel: 'mastered', comingSoonLabel: 'COMING SOON', moreJourneysTitle: 'More coding journeys', moreJourneysDescription: 'New Sessions will join your Spark Journey as you grow.', lockedNowLabel: 'Locked for now', sessionSettings: 'Session settings', language: 'Language', progression: 'Learning path', guided: 'Guided', guidedHelp: 'Follow the sequence', explore: 'Explore all levels', exploreHelp: 'Inspect every Level', resetProgress: 'Reset Session Progress', progress: 'Progress', current: 'Current', missionPreview: 'Mission preview', stageReady: 'This stage will be ready when its Mission is implemented.', chooseLevel: 'Choose a Level to start learning', objective: 'Objective', missionSteps: 'Mission steps', backToJourney: 'Back to Spark Journey', sessionLevels: 'Session Levels', resetConfirmation: 'Reset progress for this Session?', runExample: 'Run example', continueToPredict: 'Continue to Think / Predict', checkPrediction: 'Check answer', continueToCode: 'Continue to Code', runCode: 'Run', continueToTest: 'Continue to Test', testCode: 'Test', codeInstruction: 'Write Python code that produces the expected message, then run it.', testInstruction: 'Run the sample test to check your behavior. Test is separate from Run.', sampleTests: 'Sample test cases', noInput: 'No input', correct: 'Correct! Nice prediction.', tryAgain: 'Not quite yet. Try again.', hint: 'Hint', showHint: 'Show hint', pass: 'PASS', fail: 'FAIL', expected: 'Expected', actual: 'Actual', error: 'Error', noError: 'None', runtimeLoading: 'Python runtime is loading…', runtimeReady: 'Python runtime ready', runtimeFailed: 'Python runtime failed to start', executionStopped: 'Execution stopped.', running: 'Running…', testing: 'Testing…', masteryAchieved: 'Level mastered!', masteryHelp: 'You proved the concept with a correct prediction and working Python code.',
  },
  th: {
    hubEyebrow: 'LEARNING HUB', hubTitle: 'เลือกเส้นทางการเรียนรู้ของคุณ', hubDescription: 'เริ่มจากแนวคิดเล็ก ๆ แล้วค่อย ๆ สร้างทักษะการเขียนโค้ดทีละ Mission', hubAction: 'เปิด Python Session 1', hubStatus: 'พร้อมเริ่มต้น', coursesLabel: 'คอร์ส', pythonCodingLabel: 'PYTHON CODING', masteredLabel: 'ผ่านแล้ว', comingSoonLabel: 'เร็ว ๆ นี้', moreJourneysTitle: 'เส้นทางการเขียนโค้ดเพิ่มเติม', moreJourneysDescription: 'จะมี Session ใหม่เพิ่มเข้ามาใน Spark Journey เมื่อคุณพัฒนาขึ้น', lockedNowLabel: 'ยังไม่เปิดให้ใช้', sessionSettings: 'ตั้งค่า Session', language: 'ภาษา', progression: 'ลำดับการเรียน', guided: 'เรียนตามลำดับ (Guided)', guidedHelp: 'เรียนตามลำดับ', explore: 'เปิดดูทุก Level (Explore)', exploreHelp: 'เปิดดูทุก Level เพื่อทดลอง', resetProgress: 'รีเซ็ต progress ของ Session', progress: 'ความคืบหน้า', current: 'กำลังเรียน', missionPreview: 'ตัวอย่าง Mission', stageReady: 'Stage นี้จะพร้อมเมื่อ Mission ถูกเปิดใช้งาน', chooseLevel: 'เลือก Level เพื่อเริ่มเรียน', objective: 'เป้าหมาย', missionSteps: 'ขั้นตอนของ Mission', backToJourney: 'กลับไป Spark Journey', sessionLevels: 'Levels ใน Session', resetConfirmation: 'ต้องการล้าง progress ของ Session นี้หรือไม่?', runExample: 'ลองรันตัวอย่าง', continueToPredict: 'ไปต่อที่ Think / Predict', checkPrediction: 'ตรวจคำตอบ', continueToCode: 'ไปต่อที่ Code', runCode: 'Run', continueToTest: 'ไปต่อที่ Test', testCode: 'Test', codeInstruction: 'เขียน Python ให้แสดงข้อความที่กำหนด แล้วกด Run', testInstruction: 'กด Test เพื่อตรวจ behavior จาก sample test แยกจาก Run', sampleTests: 'ตัวอย่าง test cases', noInput: 'ไม่มี input', correct: 'ถูกต้อง! คาดเดาได้ดีมาก', tryAgain: 'ยังไม่ถูก ลองใหม่ได้เลย', hint: 'Hint', showHint: 'ดู hint', pass: 'ผ่าน', fail: 'ไม่ผ่าน', expected: 'Expected', actual: 'Actual', error: 'Error', noError: 'ไม่มี', runtimeLoading: 'กำลังโหลด Python runtime…', runtimeReady: 'Python runtime พร้อมใช้', runtimeFailed: 'Python runtime เริ่มทำงานไม่สำเร็จ', executionStopped: 'หยุดการทำงานแล้ว', running: 'กำลัง Run…', testing: 'กำลัง Test…', masteryAchieved: 'ผ่าน Level แล้ว!', masteryHelp: 'คุณพิสูจน์ concept นี้ด้วยคำตอบที่ถูกและ Python code ที่ทำงานได้',
  },
}

export function getSessionUiCopy(locale: 'en' | 'th') {
  return sessionUiCopy[locale]
}

export type { LocalizedText }
