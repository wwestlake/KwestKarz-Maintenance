export type OrientationStageKey = 'show' | 'tell' | 'do' | 'grade'

export type OrientationResource = {
  label: string
  href: string
  external?: boolean
}

export type OrientationQuiz = {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

export type OrientationLesson = {
  id: string
  title: string
  summary: string
  required: boolean
  roles: string[]
  prerequisites: string[]
  resources: OrientationResource[]
  stages: Record<OrientationStageKey, { title: string; body: string; bullets?: string[] }>
  practiceChecklist: string[]
  quiz: OrientationQuiz
}

export type OrientationProgress = {
  contentVersion: number
  selectedLessonId: string
  stageByLesson: Record<string, number>
  quizByLesson: Record<string, number | null>
  practiceByLesson: Record<string, boolean[]>
  completedLessons: string[]
}

export const orientationLessonSetVersion = 1

export const orientationLessons: OrientationLesson[] = [
  {
    id: 'welcome',
    title: 'Welcome and access basics',
    summary: 'Start here to learn where the public site lives and how employees enter the maintenance app.',
    required: true,
    roles: ['worker', 'manager', 'admin'],
    prerequisites: [],
    resources: [
      { label: 'Public home', href: '/' },
      { label: 'Employee login', href: '/employee' },
      { label: 'Help page', href: '/help' },
    ],
    stages: {
      show: {
        title: 'Show',
        body: 'Read the layout of the site first: guests see the public pages, and the team uses employee login to reach the working app.',
        bullets: ['Open the public home page', 'Find the employee login entry point', 'Notice where the public and employee paths split'],
      },
      tell: {
        title: 'Tell',
        body: 'A supervisor should explain the difference between public browsing and internal operations before any hands-on steps.',
        bullets: ['Who uses the public pages?', 'Who uses employee login?', 'What lives behind the employee wall?'],
      },
      do: {
        title: 'Do',
        body: 'Practice the route change yourself and make sure you can move from the public page into the employee app and back again.',
        bullets: ['Open the public home page', 'Use the employee login link', 'Return to the public site'],
      },
      grade: {
        title: 'Grade',
        body: 'Confirm the employee knows the difference between the public entry point and the internal app.',
      },
    },
    practiceChecklist: ['I can open the public page', 'I can find employee login', 'I can return to the public site'],
    quiz: {
      question: 'Which link takes an employee into the working app?',
      options: ['Our Cars', 'Employee Login', 'Help'],
      correctIndex: 1,
      explanation: 'Employee Login is the entry point into the internal app shell.',
    },
  },
  {
    id: 'workflow-basics',
    title: 'Workflow basics',
    summary: 'Learn the show / tell / do / grade pattern the app uses for guided operations.',
    required: true,
    roles: ['worker', 'manager', 'admin'],
    prerequisites: ['welcome'],
    resources: [
      { label: 'Workflows area', href: '/employee' },
      { label: 'Guided help', href: '/help' },
    ],
    stages: {
      show: {
        title: 'Show',
        body: 'The system walks one task at a time so people stay focused and do not skip steps.',
        bullets: ['One action per screen', 'Backtracks clear dependent steps', 'Progress stays visible'],
      },
      tell: {
        title: 'Tell',
        body: 'A trainer should explain why the app separates steps into a guided tunnel instead of dumping out a big form.',
        bullets: ['Why one screen at a time helps', 'Why backtracking is controlled', 'Why autosave matters'],
      },
      do: {
        title: 'Do',
        body: 'Practice a workflow step with a simple example and move through the guided shell without leaving the flow.',
        bullets: ['Start a workflow', 'Advance one step', 'Return to the dashboard'],
      },
      grade: {
        title: 'Grade',
        body: 'Make sure the learner can describe the guided pattern and use it without supervision.',
      },
    },
    practiceChecklist: ['I can start a workflow', 'I can advance one step', 'I can go back to the dashboard'],
    quiz: {
      question: 'What is the point of the guided workflow shell?',
      options: ['Show more buttons on screen', 'Keep people moving through one step at a time', 'Hide progress from the user'],
      correctIndex: 1,
      explanation: 'The guided shell is meant to keep the operator focused on one step and protect data integrity.',
    },
  },
  {
    id: 'fleet-practical',
    title: 'Fleet practicals and handoff',
    summary: 'Learn the day-to-day fleet work that employees actually touch: media, notes, and handoff habits.',
    required: true,
    roles: ['worker', 'manager', 'admin'],
    prerequisites: ['workflow-basics'],
    resources: [
      { label: 'Fleet showcase', href: '/cars' },
      { label: 'Contact support', href: '/contact' },
      { label: 'About Turo', href: '/about-turo' },
    ],
    stages: {
      show: {
        title: 'Show',
        body: 'Show the employee where fleet information lives and how public pages relate to the internal app.',
        bullets: ['Look at the public fleet page', 'Review the contact path', 'Point out where guests stop and the team starts'],
      },
      tell: {
        title: 'Tell',
        body: 'Explain the handoff habits that keep the fleet organized: clear notes, clean photos, and simple communication.',
        bullets: ['Use plain notes', 'Keep public details accurate', 'Escalate issues quickly'],
      },
      do: {
        title: 'Do',
        body: 'Practice a mock handoff: review the public page, inspect the contact path, and describe what a guest would see.',
        bullets: ['Open a fleet page', 'Find the contact link', 'Say what the guest experience looks like'],
      },
      grade: {
        title: 'Grade',
        body: 'The learner should be able to explain the guest-facing side and the internal side without mixing them up.',
      },
    },
    practiceChecklist: ['I can explain the guest side', 'I can explain the internal side', 'I can keep handoff notes clear'],
    quiz: {
      question: 'Which habit best supports a clean handoff?',
      options: ['Long vague notes', 'Clear photos and concise notes', 'Leaving details for later'],
      correctIndex: 1,
      explanation: 'Short, accurate notes and clean media make the handoff usable for the next person.',
    },
  },
  {
    id: 'optional-tools',
    title: 'Optional tools and quiz practice',
    summary: 'Optional practice for employees who want extra confidence with the orientation system.',
    required: false,
    roles: ['worker', 'manager', 'admin'],
    prerequisites: ['fleet-practical'],
    resources: [
      { label: 'Help center', href: '/help' },
      { label: 'Public contact page', href: '/contact' },
      { label: 'Turo support', href: 'https://help.turo.com', external: true },
    ],
    stages: {
      show: {
        title: 'Show',
        body: 'Use this lesson to reinforce the main support paths and quiz flow before making changes in the app.',
        bullets: ['Review the help page', 'Open contact information', 'Notice the support chain'],
      },
      tell: {
        title: 'Tell',
        body: 'This is the place to talk through how quizzes and reference links should work before rollout.',
        bullets: ['What should be required?', 'Where should references live?', 'What should pass/fail look like?'],
      },
      do: {
        title: 'Do',
        body: 'Try the optional practice quiz and use the reference links if you need help.',
        bullets: ['Open a reference link', 'Answer the practice question', 'Review the explanation'],
      },
      grade: {
        title: 'Grade',
        body: 'This lesson is optional, so the score is for practice rather than gatekeeping.',
      },
    },
    practiceChecklist: ['I can use reference links', 'I can answer practice questions', 'I can explain pass/fail rules'],
    quiz: {
      question: 'What makes this lesson optional?',
      options: ['It is only for managers', 'It is for extra practice, not gatekeeping', 'It replaces all required lessons'],
      correctIndex: 1,
      explanation: 'Optional lessons can help people get comfortable without blocking the core onboarding path.',
    },
  },
]
