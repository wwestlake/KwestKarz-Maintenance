import { useEffect, useMemo, useState } from 'react'
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, GraduationCap, Lock, PlayCircle, ShieldCheck } from 'lucide-react'

type OrientationStageKey = 'show' | 'tell' | 'do' | 'grade'

type OrientationResource = {
  label: string
  href: string
  external?: boolean
}

type OrientationQuiz = {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

type OrientationLesson = {
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

type OrientationProgress = {
  selectedLessonId: string
  stageByLesson: Record<string, number>
  quizByLesson: Record<string, number | null>
  practiceByLesson: Record<string, boolean[]>
  completedLessons: string[]
}

const orientationStorageKey = 'kwestkarz.orientation.progress'
const stageOrder: OrientationStageKey[] = ['show', 'tell', 'do', 'grade']

const lessons: OrientationLesson[] = [
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

function readProgress(): OrientationProgress {
  const fallback: OrientationProgress = {
    selectedLessonId: lessons[0].id,
    stageByLesson: {},
    quizByLesson: {},
    practiceByLesson: {},
    completedLessons: [],
  }

  try {
    const raw = localStorage.getItem(orientationStorageKey)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<OrientationProgress>
    return {
      selectedLessonId: parsed.selectedLessonId || fallback.selectedLessonId,
      stageByLesson: parsed.stageByLesson || {},
      quizByLesson: parsed.quizByLesson || {},
      practiceByLesson: parsed.practiceByLesson || {},
      completedLessons: parsed.completedLessons || [],
    }
  } catch {
    return fallback
  }
}

function stageIndexToKey(index: number): OrientationStageKey {
  return stageOrder[Math.max(0, Math.min(index, stageOrder.length - 1))]
}

export function OrientationPanel() {
  const [progress, setProgress] = useState<OrientationProgress>(readProgress)
  const [statusMessage, setStatusMessage] = useState('Pick a lesson to begin.')

  useEffect(() => {
    localStorage.setItem(orientationStorageKey, JSON.stringify(progress))
  }, [progress])

  const selectedLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === progress.selectedLessonId) ?? lessons[0],
    [progress.selectedLessonId],
  )

  const stageIndex = Math.min(progress.stageByLesson[selectedLesson.id] ?? 0, stageOrder.length - 1)
  const currentStage = stageIndexToKey(stageIndex)
  const stage = selectedLesson.stages[currentStage]
  const selectedQuizAnswer = progress.quizByLesson[selectedLesson.id] ?? null
  const quizCorrect = selectedQuizAnswer === selectedLesson.quiz.correctIndex
  const practiceChecks = progress.practiceByLesson[selectedLesson.id] ?? selectedLesson.practiceChecklist.map(() => false)
  const requiredComplete = lessons.filter((lesson) => lesson.required && progress.completedLessons.includes(lesson.id)).length
  const totalRequired = lessons.filter((lesson) => lesson.required).length
  const completedLessons = progress.completedLessons.length
  const isLocked = selectedLesson.prerequisites.some((id) => !progress.completedLessons.includes(id))

  function saveProgress(next: Partial<OrientationProgress>) {
    setProgress((current) => ({ ...current, ...next }))
  }

  function selectLesson(lesson: OrientationLesson) {
    saveProgress({ selectedLessonId: lesson.id })
    setStatusMessage(isLessonUnlocked(lesson) ? `Opened ${lesson.title}.` : `${lesson.title} is locked until prerequisites are complete.`)
  }

  function isLessonUnlocked(lesson: OrientationLesson) {
    return !lesson.prerequisites.some((id) => !progress.completedLessons.includes(id))
  }

  function setLessonStage(lessonId: string, nextStageIndex: number) {
    saveProgress({ stageByLesson: { ...progress.stageByLesson, [lessonId]: nextStageIndex } })
  }

  function setQuizAnswer(lessonId: string, answerIndex: number) {
    saveProgress({ quizByLesson: { ...progress.quizByLesson, [lessonId]: answerIndex } })
  }

  function setPracticeCheck(lessonId: string, checkIndex: number, checked: boolean) {
    const nextChecks = [...(progress.practiceByLesson[lessonId] ?? selectedLesson.practiceChecklist.map(() => false))]
    nextChecks[checkIndex] = checked
    saveProgress({ practiceByLesson: { ...progress.practiceByLesson, [lessonId]: nextChecks } })
  }

  function markCompleted(lessonId: string) {
    if (progress.completedLessons.includes(lessonId)) return
    saveProgress({ completedLessons: [...progress.completedLessons, lessonId] })
  }

  function advanceStage() {
    if (isLocked) {
      setStatusMessage('Finish the prerequisite lessons first.')
      return
    }

    if (currentStage === 'do' && practiceChecks.some((checked) => !checked)) {
      setStatusMessage('Complete the practice checklist before moving on.')
      return
    }

    if (currentStage === 'grade' && !quizCorrect) {
      setStatusMessage('Choose the correct quiz answer before grading.')
      return
    }

    if (currentStage === 'grade') {
      markCompleted(selectedLesson.id)
      setStatusMessage(`${selectedLesson.title} completed.`)
      const nextLesson = lessons.find((lesson) => !progress.completedLessons.includes(lesson.id) && isLessonUnlocked(lesson))
      if (nextLesson) {
        saveProgress({ selectedLessonId: nextLesson.id })
      }
      return
    }

    setLessonStage(selectedLesson.id, stageIndex + 1)
    setStatusMessage(`Moved to ${stageOrder[stageIndex + 1]} in ${selectedLesson.title}.`)
  }

  function goBack() {
    if (stageIndex === 0) return
    setLessonStage(selectedLesson.id, stageIndex - 1)
    setStatusMessage(`Moved back to ${stageOrder[stageIndex - 1]}.`)
  }

  return (
    <section className="area-grid orientation-grid">
      <article className="panel area-panel orientation-library">
        <div className="section-heading">
          <div>
            <h2>Orientation library</h2>
            <p>Lessons, quizzes, and links for new employee onboarding.</p>
          </div>
          <span className="tag">{completedLessons} done</span>
        </div>

        <div className="orientation-summary-grid">
          <div className="orientation-summary-card">
            <ShieldCheck size={18} strokeWidth={2.2} />
            <strong>{requiredComplete}/{totalRequired} required</strong>
            <span>Required lessons completed.</span>
          </div>
          <div className="orientation-summary-card">
            <GraduationCap size={18} strokeWidth={2.2} />
            <strong>{completedLessons} complete</strong>
            <span>Total lessons finished.</span>
          </div>
          <div className="orientation-summary-card">
            <BookOpen size={18} strokeWidth={2.2} />
            <strong>{lessons.length} lessons</strong>
            <span>Show / tell / do / grade structure.</span>
          </div>
        </div>

        <div className="orientation-lesson-list">
          {lessons.map((lesson) => {
            const unlocked = isLessonUnlocked(lesson)
            const selected = lesson.id === selectedLesson.id
            const done = progress.completedLessons.includes(lesson.id)
            return (
              <button
                key={lesson.id}
                type="button"
                className={`orientation-lesson-button${selected ? ' selected' : ''}`}
                onClick={() => selectLesson(lesson)}
              >
                <div className="orientation-lesson-heading">
                  <strong>{lesson.title}</strong>
                  <span className="orientation-lesson-tags">
                    <span className={`tag ${lesson.required ? 'tag-ok' : 'tag-muted'}`}>{lesson.required ? 'Required' : 'Optional'}</span>
                    <span className="tag">{lesson.roles.join(' / ')}</span>
                    {!unlocked && <span className="tag tag-warn"><Lock size={12} strokeWidth={2.5} /> Locked</span>}
                    {done && <span className="tag tag-ok"><CheckCircle2 size={12} strokeWidth={2.5} /> Complete</span>}
                  </span>
                </div>
                <span className="orientation-lesson-summary">{lesson.summary}</span>
              </button>
            )
          })}
        </div>
      </article>

      <article className="panel area-panel orientation-player">
        <div className="section-heading">
          <div>
            <h2>{selectedLesson.title}</h2>
            <p>{selectedLesson.summary}</p>
          </div>
          <div className="heading-actions">
            <span className={`tag ${selectedLesson.required ? 'tag-ok' : 'tag-muted'}`}>{selectedLesson.required ? 'Required' : 'Optional'}</span>
            {isLocked ? <span className="tag tag-warn"><Lock size={12} strokeWidth={2.5} /> Locked</span> : <span className="tag tag-ok">Ready</span>}
          </div>
        </div>

        <div className="orientation-progress">
          <div className="orientation-progress-fill" style={{ width: `${((stageIndex + (progress.completedLessons.includes(selectedLesson.id) ? 1 : 0)) / stageOrder.length) * 100}%` }} />
        </div>

        <div className="orientation-stage-bar">
          {stageOrder.map((key, index) => (
            <div key={key} className={`orientation-stage-pill${index === stageIndex ? ' active' : ''}${index < stageIndex ? ' complete' : ''}`}>
              <span>{index + 1}</span>
              <strong>{key}</strong>
            </div>
          ))}
        </div>

        <div className="orientation-stage-card">
          <div className="orientation-stage-heading">
            <span className="tag">{stage.title}</span>
            <span className="hint-text">{statusMessage}</span>
          </div>
          <p className="orientation-stage-body">{stage.body}</p>

          {stage.bullets && (
            <ul className="orientation-bullets">
              {stage.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ul>
          )}

          {currentStage === 'show' && (
            <div className="orientation-links">
              {selectedLesson.resources.map((resource) => (
                <a
                  key={resource.label}
                  className="public-secondary-link orientation-link"
                  href={resource.href}
                  target={resource.external ? '_blank' : undefined}
                  rel={resource.external ? 'noreferrer' : undefined}
                >
                  <ExternalLink size={14} strokeWidth={2.2} />
                  {resource.label}
                </a>
              ))}
            </div>
          )}

          {currentStage === 'do' && (
            <div className="orientation-do-box">
              <div className="orientation-checklist">
                {selectedLesson.practiceChecklist.map((item, index) => (
                  <label key={item} className="orientation-check-item">
                    <input
                      type="checkbox"
                      checked={practiceChecks[index] ?? false}
                      onChange={(event) => setPracticeCheck(selectedLesson.id, index, event.target.checked)}
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {currentStage === 'grade' && (
            <div className="orientation-quiz">
              <p className="orientation-quiz-question">{selectedLesson.quiz.question}</p>
              <div className="orientation-quiz-options">
                {selectedLesson.quiz.options.map((option, index) => (
                  <label key={option} className={`orientation-quiz-option${selectedQuizAnswer === index ? ' selected' : ''}`}>
                    <input
                      type="radio"
                      name={`quiz-${selectedLesson.id}`}
                      checked={selectedQuizAnswer === index}
                      onChange={() => setQuizAnswer(selectedLesson.id, index)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
              {selectedQuizAnswer !== null && (
                <p className={quizCorrect ? 'tag tag-ok orientation-quiz-result' : 'tag tag-warn orientation-quiz-result'}>
                  {quizCorrect ? `Correct. ${selectedLesson.quiz.explanation}` : 'Try again before completing the lesson.'}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="orientation-actions">
          <button type="button" className="secondary-button" onClick={goBack} disabled={stageIndex === 0}>
            <ChevronLeft size={16} strokeWidth={2.2} />
            Back
          </button>
          <button type="button" className="primary-action" onClick={advanceStage} disabled={isLocked}>
            {currentStage === 'grade' ? (
              <>
                <CheckCircle2 size={16} strokeWidth={2.2} />
                Grade and complete
              </>
            ) : (
              <>
                <ChevronRight size={16} strokeWidth={2.2} />
                Next
              </>
            )}
          </button>
        </div>

        <div className="orientation-footer">
          <span className="hint-text">
            {isLocked
              ? 'Prerequisite lessons are still locked.'
              : currentStage === 'grade'
                ? 'The final quiz decides completion.'
                : 'Continue through the guided lesson one stage at a time.'}
          </span>
          <span className="hint-text">
            <PlayCircle size={14} strokeWidth={2.2} /> Show / tell / do / grade
          </span>
        </div>
      </article>
    </section>
  )
}
