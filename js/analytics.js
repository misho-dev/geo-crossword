
/**
 * სიტყვანა — Gameplay Analytics
 * Provider: Umami
 * No dependencies, backend, or cookies required by this module.
 */
(function () {
  "use strict";

  const sessions = new Map();
  let activePuzzleId = null;

  function send(event, data = {}) {
    if (
      !window.umami ||
      typeof window.umami.track !== "function"
    ) {
      return;
    }

    try {
      window.umami.track(event, data);
    } catch (error) {
      // Analytics must never interrupt gameplay.
      console.debug("Analytics unavailable", error);
    }
  }

  function session(id) {
    return sessions.get(String(id));
  }

  function elapsed(s) {
    return Math.round(
      (Date.now() - s.startedAt) / 1000
    );
  }

  function createSession(id, difficulty = "unknown") {
    const key = String(id);

    const s = {
      id: key,
      difficulty,
      startedAt: Date.now(),
      started: false,
      completed: false,
      hints: 0,
      mistakes: 0,
      lastProgress: 0
    };

    sessions.set(key, s);
    return s;
  }

  function eventData(s, extra = {}) {
    return {
      puzzle_id: s.id,
      difficulty: s.difficulty,
      ...extra
    };
  }

  const Analytics = {

    open(id, difficulty, resumed = false) {
      const key = String(id);

      // Prevent duplicate events when opening
      // the already active puzzle.
      if (activePuzzleId === key) return;

      if (activePuzzleId !== null) {
        this.switch(activePuzzleId);
      }

      const s = createSession(id, difficulty);
      activePuzzleId = key;

      send("puzzle_open", eventData(s));

      if (resumed) {
        s.started = true;

        send("puzzle_resume", eventData(s));
      }
    },

    start(id) {
      const s = session(id);
      if (!s || s.started || s.completed) return;

      s.started = true;
      s.startedAt = Date.now();

      send("puzzle_start", eventData(s));
    },

    progress(id, percent) {
      const s = session(id);
      if (!s || s.completed) return;

      s.lastProgress = Math.max(
        0,
        Math.min(100, Number(percent) || 0)
      );
    },

    hint(id, type = "letter") {
      const s = session(id);
      if (!s || s.completed) return;

      s.hints++;

      send("hint_used", eventData(s, {
        hint_type: type,
        total_hints: s.hints
      }));
    },

    check(id, correct, mistakes = 0) {
      const s = session(id);
      if (!s || s.completed) return;

      const count = Math.max(0, Number(mistakes) || 0);

      if (!correct) {
        s.mistakes += count;
      }

      send("answer_checked", eventData(s, {
        correct: Boolean(correct),
        mistakes_found: count
      }));
    },

    complete(id, score = 0) {
      const s = session(id);
      if (!s || s.completed) return;

      s.completed = true;
      s.lastProgress = 100;

      send("puzzle_complete", eventData(s, {
        duration_seconds: elapsed(s),
        hints_used: s.hints,
        mistakes: s.mistakes,
        score: Number(score) || 0
      }));
    },

    reset(id) {
      const s = session(id);
      if (!s) return;

      send("puzzle_reset", eventData(s, {
        duration_seconds: elapsed(s),
        progress_percent: s.lastProgress
      }));

      // A reset starts a new gameplay attempt.
      createSession(id, s.difficulty);
    },

    switch(id) {
      const s = session(id);
      if (!s) return;

      if (s.started && !s.completed) {
        send("puzzle_switch", eventData(s, {
          duration_seconds: elapsed(s),
          progress_percent: s.lastProgress
        }));
      }

      if (activePuzzleId === String(id)) {
        activePuzzleId = null;
      }

      sessions.delete(String(id));
    }
  };

  // Best-effort exit tracking.
  // Keep events low: don't track completed puzzles.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;

    const s = session(activePuzzleId);

    if (s && s.started && !s.completed) {
      send("puzzle_exit", eventData(s, {
        duration_seconds: elapsed(s),
        progress_percent: s.lastProgress
      }));
    }
  });

  window.GameAnalytics = Analytics;
})();
