# Project Specifications – Attendance Management App


## Mocks: ./mock.webp
## NFR: 
- Offline first
- High focus on security

## Tech Stack

- **Frontend**: React Native (Expo)
- **Backend / Database**: Supabase
- **Authentication**: Supabase OAuth
- **Offline-first** approach with local persistence and cloud sync


## Core Concept

The application is designed to manage student attendance for recurring classes (e.g. Kendo classes, sports, training sessions).

The core shared entity is called a **Club** (name can be refined later: Club / Class Group / Dojo).

A Club is shared between multiple instructors, all syncing the same data.


## 1. Creation Features

### 1.1 Club Creation

A **Club** represents:
- A group of students
- A set of recurring weekly sessions
- Valid for a full academic year

Club creation includes:
- Club name
- Optional description
- Academic year (start date / end date)

### 1.2 Recurring Sessions

- Define one or more weekly sessions
- Each session has:
  - Day of week
  - Start time
  - End time
- Sessions are **recurring weekly across the academic year**

Example:
- Monday 18:00–20:00
- Thursday 19:00–21:00

### 1.3 Participant Creation

- Create people (students) who attend the club
- Each participant has:
  - First name
  - Last name
  - Optional metadata (grade, level, notes)

---

## 2. Regular Usage (Attendance)

### 2.1 Session Selection

- Instructor selects:
  1. A **Club**
  2. A **Session** (for a specific date)

The app should automatically generate the session date based on the recurring schedule.

### 2.2 Attendance Marking

- Display a **simple checklist** of participants
- Each participant can be marked:
  - Present
  - Absent (default)

UX goal:
- Extremely fast
- One tap per student
- No photos, only names (simplicity first)

### 2.3 Saving

- Attendance is saved:
  - Locally (offline support)
  - Then synced to Supabase when online

---

## 3. Sharing & Multi-Instructor Support

### 3.1 Shared Club Data

- Multiple instructors can access the same Club
- All data is synchronized via Supabase

### 3.2 Authentication

- Supabase OAuth authentication
- Each instructor has their own account

### 3.3 Club Access

To join an existing Club:
- Instructor must enter:
  - Club code
  - Club password
- Once validated, the instructor gains access to all club data

Permissions:
- All instructors can mark attendance
- (Future: role-based permissions)

---

## 4. Cloud Storage

Supabase stores:
- Clubs
- Sessions
- Participants
- Daily attendance records

Data model should support:
- Offline-first sync
- Conflict resolution (last-write-wins is acceptable for v1)

---

## 5. Visualization & Statistics

### 5.1 Session Statistics

- Attendance percentage per session
  - Example: 12 present / 15 total → 80%

### 5.2 Yearly Statistics

- Overall attendance percentage for the academic year

### 5.3 Per Student Statistics

For each student:
- Monthly attendance percentage
- Yearly attendance percentage

### 5.4 Leaderboards

- Rank students by attendance:
  - Weekly
  - Monthly
  - Yearly

Purpose:
- Motivation
- Shareable leaderboard (e.g. screenshot-friendly)

---

## 6. Long-Term / Future Feature (DO NOT IMPLEMENT NOW)

⚠️ **Do not implement**, but keep in mind for architecture decisions:

- Students may pre-register attendance
- Students can mark themselves as:
  - Will attend
  - Will not attend
- This may impact future data models and APIs

---

## Non-Goals (for v1)

- No ads
- No public student accounts
- No advanced permissions
- No payments

---

## UX Principles

- Extremely simple
- Optimized for instructors during class
- Minimal number of taps
- Fast loading
- Works offline

---

## Notes

- Naming can evolve (Club / Class / Dojo)
- Prefer clarity over abstraction
- Favor maintainability and explicit schemas

