# REX Cloud Admin v2

Panel administratora do zarządzania grafikiem pracowników - inspirowany systemem GirNET/MAPAL Workforce.

## Funkcje

- **Pulpit** - przegląd statystyk i szybkie akcje
- **Grafik tygodniowy** - układanie zmian w stylu GirNET
- **Wnioski** - zarządzanie wnioskami pracowników (urlopy, wolne, preferencje)
- **Zmiany** - lista wszystkich zmian z możliwością edycji
- **Pracownicy** - zarządzanie zespołem
- **Centra** - zarządzanie lokalizacjami
- **Ewidencja** - przegląd godzin pracy

## Instalacja

```bash
npm install
npm run dev
```

## Deploy na Vercel

1. Połącz repo z GitHub
2. Importuj projekt w Vercel
3. Deploy!

## Logowanie

- Login: `admin`
- Hasło: `admin`

## API

Aplikacja łączy się z backendem na: `https://rex-cloud-backend.vercel.app/api/calendar`
