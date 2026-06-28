import { useEffect, useMemo, useState } from 'react'
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, GraduationCap, Lock, PlayCircle, ShieldCheck } from 'lucide-react'
import {
  orientationLessonSetVersion,
  orientationLessons,
  type OrientationLesson,
  type OrientationProgress,
  type OrientationStageKey,
} from '../content/orientationLessons'

const orientationStorageKey = 'kwestkarz.orientation.progress'
const stageOrder: OrientationStageKey[] = ['show', 'tell', 'do', 'grade']

function readProgress(): OrientationProgress {
  const fallback: OrientationProgress = {
    contentVersion: orientationLessonSetVersion,
    selectedLessonId: orientationLessons[0].id,
    stageByLesson: {},
    quizByLesson: {},
    practiceByLesson: {},
    completedLessons: [],
  }

  try {
    const raw = localStorage.getItem(orientationStorageKey)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<OrientationProgress>
    if (parsed.contentVersion !== orientationLessonSetVersion) return fallback
    return {
      contentVersion: orientationLessonSetVersion,
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
    () => orientationLessons.find((lesson) => lesson.id === progress.selectedLessonId) ?? orientationLessons[0],
    [progress.selectedLessonId],
  )

  const stageIndex = Math.min(progress.stageByLesson[selectedLesson.id] ?? 0, stageOrder.length - 1)
  const currentStage = stageIndexToKey(stageIndex)
  const stage = selectedLesson.stages[currentStage]
  const selectedQuizAnswer = progress.quizByLesson[selectedLesson.id] ?? null
  const quizCorrect = selectedQuizAnswer === selectedLesson.quiz.correctIndex
  const practiceChecks = progress.practiceByLesson[selectedLesson.id] ?? selectedLesson.practiceChecklist.map(() => false)
  const requiredComplete = orientationLessons.filter((lesson) => lesson.required && progress.completedLessons.includes(lesson.id)).length
  const totalRequired = orientationLessons.filter((lesson) => lesson.required).length
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

  function isLessonUnlockedWithCompleted(lesson: OrientationLesson, completed: string[]) {
    return !lesson.prerequisites.some((id) => !completed.includes(id))
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
      const completedAfterSave = progress.completedLessons.includes(selectedLesson.id)
        ? progress.completedLessons
        : [...progress.completedLessons, selectedLesson.id]
      markCompleted(selectedLesson.id)
      setStatusMessage(`${selectedLesson.title} completed.`)
      const nextLesson = orientationLessons.find(
        (lesson) => !completedAfterSave.includes(lesson.id) && isLessonUnlockedWithCompleted(lesson, completedAfterSave),
      )
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
            <strong>{orientationLessons.length} lessons</strong>
            <span>Show / tell / do / grade structure.</span>
          </div>
        </div>

        <div className="orientation-lesson-list">
          {orientationLessons.map((lesson) => {
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
