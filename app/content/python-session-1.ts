export type Locale = 'en' | 'th'
export type ProgressionMode = 'guided' | 'explore'
export type SessionStage = 'play' | 'predict' | 'code' | 'test'

export interface LocalizedText {
  en: string
  th: string
}

export interface SessionLevelContent {
  id: string
  number: number
  title: LocalizedText
  objective: LocalizedText
  availableStages: SessionStage[]
  preview: LocalizedText
}

export interface PythonSessionContent {
  id: string
  title: LocalizedText
  description: LocalizedText
  levels: SessionLevelContent[]
}

export const pythonSession1: PythonSessionContent = {
  id: 'python-session-1',
  title: {
    en: 'Python Coding · Session 1',
    th: 'Python Coding · Session 1',
  },
  description: {
    en: 'Build your first Python programs by watching, predicting, coding, and testing.',
    th: 'สร้างโปรแกรม Python แรกของคุณด้วยการดู คาดเดา เขียนโค้ด และทดสอบ',
  },
  levels: [
    {
      id: 'level-1',
      number: 1,
      title: { en: 'Your first print', th: 'คำสั่ง print แรกของคุณ' },
      objective: { en: 'Make Python show a message on the screen.', th: 'ให้ Python แสดงข้อความบนหน้าจอ' },
      availableStages: ['play', 'predict', 'code', 'test'],
      preview: {
        en: 'See how Python sends a message to the screen. The coding Mission arrives next.',
        th: 'ดูว่า Python ส่งข้อความไปที่หน้าจออย่างไร แล้วพบ Mission สำหรับเขียนโค้ดในขั้นถัดไป',
      },
    },
    {
      id: 'level-2',
      number: 2,
      title: { en: 'Find the missing quote', th: 'ตามหาเครื่องหมายคำพูดที่หายไป' },
      objective: { en: 'Investigate a syntax error and repair the code.', th: 'สืบหาสาเหตุของ syntax error และแก้โค้ด' },
      availableStages: ['play', 'predict', 'code', 'test'],
      preview: {
        en: 'Read a real Python error, explain it, and fix the broken code.',
        th: 'อ่าน error จริงจาก Python อธิบายความหมาย และแก้โค้ดที่ผิด',
      },
    },
    {
      id: 'level-3',
      number: 3,
      title: { en: 'Print on new lines', th: 'แสดงผลคนละบรรทัด' },
      objective: { en: 'Use a newline to create neat multi-line output.', th: 'ใช้ newline เพื่อสร้าง output หลายบรรทัดอย่างเป็นระเบียบ' },
      availableStages: ['play', 'predict', 'code', 'test'],
      preview: {
        en: 'Predict where each line will appear, then make three lines with one print.',
        th: 'คาดเดาตำแหน่งของแต่ละบรรทัด แล้วสร้างสามบรรทัดด้วย print เดียว',
      },
    },
    {
      id: 'level-4',
      number: 4,
      title: { en: 'Output accuracy', th: 'ความถูกต้องของ output' },
      objective: { en: 'Create five sentences with exact spaces and new lines.', th: 'สร้างประโยคห้าบรรทัดโดยเว้นวรรคและขึ้นบรรทัดใหม่ให้ถูกต้อง' },
      availableStages: ['play', 'predict', 'code', 'test'],
      preview: {
        en: 'Small spaces matter. Make every part of the output match the Mission.',
        th: 'ช่องว่างเล็ก ๆ ก็สำคัญ ทำให้ output ทุกส่วนตรงกับ Mission',
      },
    },
  ],
}

