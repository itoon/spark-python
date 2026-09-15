export type Locale = 'en' | 'th'
export type ProgressionMode = 'guided' | 'explore'
export type SessionStage = 'play' | 'predict' | 'code' | 'test'

export interface LocalizedText {
  en: string
  th: string
}

export interface PlayContent {
  instruction: LocalizedText
  example: string
}

export interface PredictContent {
  prompt: LocalizedText
  interaction: 'choice' | 'order'
  options: Array<{ id: string; label: LocalizedText }>
  correctOptionIds?: string[]
}

export interface ExplanationStep {
  target: string
  body: LocalizedText
}

export interface MissionTestCase {
  id: string
  input: string[]
  expectedOutput?: string
  expectedError?: { type: string; line?: number }
}

export interface MasteryRule {
  requiredStages: SessionStage[]
  requiresPassingTest: boolean
}

export interface SessionLevelContent {
  id: string
  number: number
  title: LocalizedText
  objective: LocalizedText
  availableStages: SessionStage[]
  preview: LocalizedText
  play: PlayContent
  predict: PredictContent
  hints: LocalizedText[]
  explanationSteps: ExplanationStep[]
  starterCode: string
  testCases: MissionTestCase[]
  mastery: MasteryRule
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
      play: { instruction: { en: 'Watch Python send a message to the screen.', th: 'ดู Python ส่งข้อความไปที่หน้าจอ' }, example: 'print("Hello World")' },
      predict: { prompt: { en: 'What will this program show?', th: 'โปรแกรมนี้จะแสดงอะไร?' }, interaction: 'choice', options: [{ id: 'message', label: { en: 'Hello World', th: 'Hello World' } }, { id: 'nothing', label: { en: 'Nothing', th: 'ไม่แสดงอะไร' } }], correctOptionIds: ['message'] },
      hints: [{ en: 'Look at the text inside print().', th: 'ดูข้อความที่อยู่ใน print()' }],
      explanationSteps: [],
      starterCode: 'print("Hello World")',
      testCases: [{ id: 'hello-world', input: [], expectedOutput: 'Hello World' }],
      mastery: { requiredStages: ['play', 'predict', 'code', 'test'], requiresPassingTest: true },
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
      play: { instruction: { en: 'Look closely at a broken print statement.', th: 'สังเกต print statement ที่มีบางอย่างผิด' }, example: 'print("Hello World)' },
      predict: { prompt: { en: 'What kind of problem do you predict?', th: 'คุณคาดว่าจะเกิดปัญหาประเภทใด?' }, interaction: 'choice', options: [{ id: 'syntax', label: { en: 'A syntax error', th: 'syntax error' } }, { id: 'output', label: { en: 'Only a different output', th: 'แค่ output ต่างกัน' } }], correctOptionIds: ['syntax'] },
      hints: [{ en: 'Compare the opening and closing quotes.', th: 'เปรียบเทียบเครื่องหมายคำพูดเปิดและปิด' }],
      explanationSteps: [],
      starterCode: 'print("Hello World)',
      testCases: [{ id: 'missing-quote', input: [], expectedError: { type: 'SyntaxError', line: 1 } }],
      mastery: { requiredStages: ['play', 'predict', 'code', 'test'], requiresPassingTest: true },
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
      play: { instruction: { en: 'See how one string can contain new lines.', th: 'ดูว่า string เดียวสามารถมีหลายบรรทัดได้อย่างไร' }, example: 'print("Hello\\nWorld")' },
      predict: { prompt: { en: 'Where will the newline place the next word?', th: 'newline จะวางคำถัดไปไว้ตรงไหน?' }, interaction: 'order', options: [{ id: 'first', label: { en: 'First line', th: 'บรรทัดแรก' } }, { id: 'second', label: { en: 'Second line', th: 'บรรทัดที่สอง' } }], correctOptionIds: ['first', 'second'] },
      hints: [{ en: 'The n in backslash-n means new line.', th: 'ตัว n ใน backslash-n หมายถึงบรรทัดใหม่' }],
      explanationSteps: [],
      starterCode: 'print("Hello\\nWorld")',
      testCases: [{ id: 'three-lines', input: [], expectedOutput: 'Hello\nWorld' }],
      mastery: { requiredStages: ['play', 'predict', 'code', 'test'], requiresPassingTest: true },
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
      play: { instruction: { en: 'Compare output with and without a space.', th: 'เปรียบเทียบ output ที่มีและไม่มีช่องว่าง' }, example: 'print("Hello World")' },
      predict: { prompt: { en: 'Which output keeps the required space?', th: 'output แบบใดมีช่องว่างตามที่กำหนด?' }, interaction: 'choice', options: [{ id: 'spaced', label: { en: 'Hello World', th: 'Hello World' } }, { id: 'joined', label: { en: 'HelloWorld', th: 'HelloWorld' } }], correctOptionIds: ['spaced'] },
      hints: [{ en: 'Spaces inside a string are part of the output.', th: 'ช่องว่างใน string เป็นส่วนหนึ่งของ output' }],
      explanationSteps: [],
      starterCode: 'print("Hello World")',
      testCases: [{ id: 'exact-sentence', input: [], expectedOutput: 'Hello World' }],
      mastery: { requiredStages: ['play', 'predict', 'code', 'test'], requiresPassingTest: true },
    },
  ],
}
