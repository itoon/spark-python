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
}

export const sessionUiCopy: Record<'en' | 'th', SessionUiCopy> = {
  en: {
    hubEyebrow: 'LEARNING HUB', hubTitle: 'Choose your learning path', hubDescription: 'Start with small ideas and build your coding skills one Mission at a time.', hubAction: 'Open Python Session 1', hubStatus: 'Ready to start', coursesLabel: 'Courses', pythonCodingLabel: 'PYTHON CODING', masteredLabel: 'mastered', comingSoonLabel: 'COMING SOON', moreJourneysTitle: 'More coding journeys', moreJourneysDescription: 'New Sessions will join your Spark Journey as you grow.', lockedNowLabel: 'Locked for now', sessionSettings: 'Session settings', language: 'Language', progression: 'Learning path', guided: 'Guided', guidedHelp: 'Follow the sequence', explore: 'Explore all levels', exploreHelp: 'Inspect every Level', resetProgress: 'Reset Session Progress', progress: 'Progress', current: 'Current', missionPreview: 'Mission preview', stageReady: 'This stage will be ready when its Mission is implemented.', chooseLevel: 'Choose a Level to start learning', objective: 'Objective', missionSteps: 'Mission steps', backToJourney: 'Back to Spark Journey', sessionLevels: 'Session Levels', resetConfirmation: 'Reset progress for this Session?',
  },
  th: {
    hubEyebrow: 'LEARNING HUB', hubTitle: 'เลือกเส้นทางการเรียนรู้ของคุณ', hubDescription: 'เริ่มจากแนวคิดเล็ก ๆ แล้วค่อย ๆ สร้างทักษะการเขียนโค้ดทีละ Mission', hubAction: 'เปิด Python Session 1', hubStatus: 'พร้อมเริ่มต้น', coursesLabel: 'คอร์ส', pythonCodingLabel: 'PYTHON CODING', masteredLabel: 'ผ่านแล้ว', comingSoonLabel: 'เร็ว ๆ นี้', moreJourneysTitle: 'เส้นทางการเขียนโค้ดเพิ่มเติม', moreJourneysDescription: 'จะมี Session ใหม่เพิ่มเข้ามาใน Spark Journey เมื่อคุณพัฒนาขึ้น', lockedNowLabel: 'ยังไม่เปิดให้ใช้', sessionSettings: 'ตั้งค่า Session', language: 'ภาษา', progression: 'ลำดับการเรียน', guided: 'Guided', guidedHelp: 'เรียนตามลำดับ', explore: 'Explore all levels', exploreHelp: 'เปิดดูทุก Level เพื่อทดลอง', resetProgress: 'Reset Session Progress', progress: 'ความคืบหน้า', current: 'กำลังเรียน', missionPreview: 'ตัวอย่าง Mission', stageReady: 'Stage นี้จะพร้อมเมื่อ Mission ถูกเปิดใช้งาน', chooseLevel: 'เลือก Level เพื่อเริ่มเรียน', objective: 'เป้าหมาย', missionSteps: 'ขั้นตอนของ Mission', backToJourney: 'กลับไป Spark Journey', sessionLevels: 'Levels ใน Session', resetConfirmation: 'ต้องการล้าง progress ของ Session นี้หรือไม่?',
  },
}

export function getSessionUiCopy(locale: 'en' | 'th') {
  return sessionUiCopy[locale]
}

export type { LocalizedText }

