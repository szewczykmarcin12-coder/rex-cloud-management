# REX Cloud Admin

Panel administratora do zarządzania grafikiem pracowników - zintegrowany z systemem REX Cloud.

## Funkcje

- **Strona domowa** - przegląd statystyk i oczekujących wniosków
- **Grafik** - układanie zmian w widoku tygodniowym
- **Wnioski** - zatwierdzanie/odrzucanie wniosków pracowników
- **Zmiany** - lista zmian zsynchronizowana z GitHub
- **Pracownicy** - zarządzanie zespołem z pozycjami: Crew, Expert/Instructor, JSM, FM, PM, AM, GM
- **Przepracowany czas** - ewidencja godzin z kalkulacją zarobków

## Instalacja lokalna

```bash
npm install
npm run dev
```

## Deploy na Vercel

1. Utwórz repozytorium na GitHub
2. Wrzuć pliki projektu
3. Importuj projekt w Vercel
4. Deploy!

## Logowanie

- **Login:** admin
- **PIN:** 1234

## API

Synchronizacja z: https://rex-cloud-backend.vercel.app/api/calendar

## Kolorystyka

Spójna z aplikacją mobilną REX Cloud:
- Primary: #082567 (darkest) → #526695 (light)
- Accent: #FDA785 (orange)
