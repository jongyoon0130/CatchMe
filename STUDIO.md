# FutureMe Studio

배포 중인 [FutureMe](https://github.com/jongyoon0130/FutureMe) (`futureme-beta.vercel.app`)와 **분리된 실험용 복제본**입니다.

- 원본 저장소·배포 URL은 건드리지 않습니다.
- UI 리디자인(Aurora), 채팅 엔진 개선 등은 **여기서만** 진행합니다.

## 로컬 실행

```bash
cd FutureMe-studio
cp .env.example .env.local   # Supabase 등 필요 시
bun install
bun run dev:chat             # http://127.0.0.1:5173/index.html
# 또는
bun run dev                  # goals.html
```

## GitHub (새 저장소)

1. GitHub에서 빈 저장소 생성 (예: `FutureMe-studio`)
2. 아래처럼 remote 연결 후 push:

```bash
git remote add origin git@github.com:<YOUR_USER>/FutureMe-studio.git
git push -u origin main
```

## Vercel (별도 배포)

1. Vercel → **Add New Project** → 새 GitHub 저장소 import
2. Framework: Vite (자동 감지)
3. Build: `bun run build` · Output: `dist`
4. **Production 도메인**을 원본(`futureme-beta`)과 다르게 설정 (예: `futureme-studio.vercel.app`)

`.vercel` 폴더는 복제 시 제외했습니다. 첫 배포 때 새 Vercel 프로젝트가 생성됩니다.

## 원본과 동기화

기능 버그픽스만 가져오고 싶을 때:

```bash
git remote add upstream https://github.com/jongyoon0130/FutureMe.git
git fetch upstream
git merge upstream/main   # 필요한 커밋만 cherry-pick 해도 됨
```
