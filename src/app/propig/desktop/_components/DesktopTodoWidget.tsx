'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ListTodo, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth, ensureFirestorePersistence } from '@/firebase/config';
import {
  DEFAULT_TODO_CATEGORIES,
  getTodoOccurrencesForDate,
  TODO_ANYTIME_COMPLETION_KEY,
  todoListService,
  type TodoCategoryOption,
  type TodoOccurrence,
  type TodoTask,
} from '@/services/todoListService';
import styles from './DesktopTodoWidget.module.css';

const todayDisplay = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
const CREATE_TASK = 'create-task';
const CREATE_CATEGORY = 'create-category';

function taskWriteKey(id: string) {
  return `task:${id}`;
}

function getLocalDateKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

interface TodoGroupProps {
  title: string;
  items: TodoOccurrence[];
  categories: TodoCategoryOption[];
  disabled: boolean;
  pending: ReadonlySet<string>;
  onToggle: (item: TodoOccurrence) => void;
}

function TodoGroup({ title, items, categories, disabled, pending, onToggle }: TodoGroupProps) {
  return (
    <section className={styles.group} aria-label={title}>
      <div className={styles.groupHeading}>
        <h2>{title}</h2>
        <span>{items.filter(({ completed }) => completed).length}/{items.length} 완료</span>
      </div>
      {items.length ? (
        <ul className={styles.items}>
          {items.map((item) => {
            const { task, completed } = item;
            const category = categories.find(({ id }) => id === task.categoryId);
            const details = [task.time, category?.label].filter(Boolean).join(' · ');

            return (
              <li key={task.id}>
                <label className={styles.task} data-completed={completed}>
                  <input
                    aria-label={task.title}
                    type="checkbox"
                    checked={completed}
                    disabled={disabled || pending.has(taskWriteKey(task.id))}
                    onChange={() => onToggle(item)}
                  />
                  <span className={styles.taskBody}>
                    <strong>{task.title}</strong>
                    {details ? <span className={styles.taskDetails}>{details}</span> : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : <p className={styles.empty}>표시할 할 일이 없습니다.</p>}
    </section>
  );
}

function TodoWidgetSession({ uid }: { uid: string }) {
  const [today, setToday] = useState(getLocalDateKey);
  const [tasks, setTasks] = useState<TodoTask[] | null>(null);
  const [categories, setCategories] = useState<TodoCategoryOption[] | null>(null);
  const [retry, setRetry] = useState(0);
  const [connectionError, setConnectionError] = useState(false);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [writeError, setWriteError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const updateToday = () => setToday(getLocalDateKey());
    const interval = window.setInterval(updateToday, 30_000);
    window.addEventListener('focus', updateToday);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', updateToday);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const isCurrent = () => active && auth.currentUser?.uid === uid;
    const onError = () => { if (isCurrent()) setConnectionError(true); };
    const unsubscribes: (() => void)[] = [];

    async function subscribe() {
      try {
        await ensureFirestorePersistence();
        if (!isCurrent()) return;
        unsubscribes.push(todoListService.subscribeTasks(
          uid,
          (next) => { if (isCurrent()) setTasks(next); },
          onError,
          { waitForServer: true },
        ));
        unsubscribes.push(todoListService.subscribeCategories(
          uid,
          (next) => { if (isCurrent()) setCategories(next); },
          onError,
          { waitForServer: true },
        ));
      } catch {
        onError();
      }
    }

    void subscribe();
    return () => {
      active = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [retry, uid]);

  const ready = tasks !== null && categories !== null && !connectionError;
  const selectedCategory = categories?.find(({ id }) => id === categoryId) ?? categories?.[0];
  const todayItems = getTodoOccurrencesForDate(tasks ?? [], today);
  const anytimeItems: TodoOccurrence[] = (tasks ?? [])
    .filter((task) => task.recurrence.mode === 'unscheduled')
    .map((task) => ({
      task,
      dateKey: TODO_ANYTIME_COMPLETION_KEY,
      completed: task.completedDates.includes(TODO_ANYTIME_COMPLETION_KEY),
    }))
    .sort((a, b) => Number(a.completed) - Number(b.completed));

  async function write(
    key: string,
    perform: () => Promise<void>,
    error: string,
    onSaved?: () => void,
  ) {
    const signedIn = () => mounted.current && auth.currentUser?.uid === uid;
    if (!ready || !signedIn() || inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setPending(new Set(inFlight.current));
    setWriteError(null);

    try {
      await perform();
      if (signedIn()) onSaved?.();
    } catch {
      if (signedIn()) setWriteError(error);
    } finally {
      inFlight.current.delete(key);
      if (signedIn()) setPending(new Set(inFlight.current));
    }
  }

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !selectedCategory) return;
    const category = selectedCategory.id;
    void write(
      CREATE_TASK,
      () => todoListService.create(uid, {
        title,
        note: '',
        startDate: getLocalDateKey(),
        time,
        categoryId: category,
        recurrenceMode: 'once',
        weekdays: [],
        monthDays: [],
        dates: [],
      }),
      '할 일을 추가하지 못했습니다. 입력한 내용을 확인하고 다시 시도해 주세요.',
      () => { setTitle(''); setTime(''); },
    );
  }

  function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryName.trim() || categories?.length !== 0) return;
    void write(
      CREATE_CATEGORY,
      async () => { await todoListService.createCategory(uid, categoryName, DEFAULT_TODO_CATEGORIES[0].color); },
      '분류를 추가하지 못했습니다. 입력한 내용을 확인하고 다시 시도해 주세요.',
      () => setCategoryName(''),
    );
  }

  function toggle(item: TodoOccurrence) {
    void write(
      taskWriteKey(item.task.id),
      () => todoListService.setOccurrenceCompleted(uid, item.task.id, item.dateKey, !item.completed),
      '완료 상태를 저장하지 못했습니다. 다시 시도해 주세요.',
    );
  }

  const addingTask = pending.has(CREATE_TASK);

  return (
    <main className={styles.widget}>
      <header className={styles.header}>
        <span className={styles.icon}><ListTodo size={19} aria-hidden="true" /></span>
        <div>
          <h1>오늘 할 일</h1>
          <time dateTime={today}>{todayDisplay.format(new Date(`${today}T00:00:00`))}</time>
        </div>
        <span className={styles.sync} role="status" aria-live="polite">
          {pending.size ? '저장 중' : ready ? '동기화됨' : ''}
        </span>
      </header>

      {connectionError ? (
        <div className={styles.notice} role="alert">
          <p>할 일 목록을 불러오지 못했습니다.</p>
          <button type="button" onClick={() => {
            setConnectionError(false);
            setTasks(null);
            setCategories(null);
            setRetry((attempt) => attempt + 1);
          }}>다시 연결</button>
        </div>
      ) : !ready ? (
        <p className={styles.notice} role="status">할 일 목록을 불러오는 중입니다.</p>
      ) : categories?.length ? (
        <form className={styles.composer} aria-label="오늘 할 일 추가" onSubmit={createTask}>
          <div className={styles.addRow}>
            <input type="text" aria-label="할 일 제목" placeholder="오늘 할 일 추가" value={title} disabled={addingTask} onChange={(event) => setTitle(event.target.value)} required />
            <button type="submit" disabled={addingTask || !title.trim()}><Plus size={15} aria-hidden="true" /> 추가</button>
          </div>
          <div className={styles.fields}>
            <label>
              <span>분류</span>
              <select value={selectedCategory?.id ?? ''} disabled={addingTask} onChange={(event) => setCategoryId(event.target.value)}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
              </select>
            </label>
            <label>
              <span>시간</span>
              <input type="time" value={time} disabled={addingTask} onChange={(event) => setTime(event.target.value)} />
            </label>
          </div>
        </form>
      ) : (
        <form className={styles.composer} aria-label="할 일 분류 추가" onSubmit={createCategory}>
          <p>할 일을 추가하려면 먼저 분류를 만드세요.</p>
          <div className={styles.addRow}>
            <input type="text" aria-label="분류 이름" placeholder="분류 이름" value={categoryName} disabled={pending.has(CREATE_CATEGORY)} onChange={(event) => setCategoryName(event.target.value)} required />
            <button type="submit" disabled={pending.has(CREATE_CATEGORY) || !categoryName.trim()}>분류 추가</button>
          </div>
        </form>
      )}

      {writeError ? <p className={styles.error} role="alert">{writeError}</p> : null}

      {tasks ? (
        <div className={styles.list}>
          <TodoGroup title="오늘 일정" items={todayItems} categories={categories ?? []} disabled={!ready} pending={pending} onToggle={toggle} />
          <TodoGroup title="상시 할 일" items={anytimeItems} categories={categories ?? []} disabled={!ready} pending={pending} onToggle={toggle} />
        </div>
      ) : null}
    </main>
  );
}

export default function DesktopTodoWidget() {
  const { currentUser } = useAuth();
  return currentUser ? <TodoWidgetSession key={currentUser.uid} uid={currentUser.uid} /> : null;
}
