# Security Specification — Sistem Absensi QR SMK Putra Gununghalu

## 1. Data Invariants
- Unauthenticated or unverified-email requests are denied across all collections.
- Only the bootstrapped Administrator (`jianmaulana44@admin.smk.belajar.id`) or registered `admin` staff in `/staff_roles/{roleId}` can manage `/pengaturan`, `/staff_roles`, `/siswa`, and delete `/absensi`.
- Registered Guru Piket (`piket`) and `admin` staff can read `/pengaturan`, `/siswa`, and read/create/update `/absensi` records for existing students, with `recordedByUid` strictly matching `request.auth.uid` and `updatedAt` strictly matching `request.time`.
- Document IDs are strictly bounded (`<= 128` chars) and alphanumeric-safe (`^[a-zA-Z0-9_\\-]+$`).

## 2. Adversarial Payloads Tested ("Dirty Dozen")
1. Unauthenticated read on `/siswa/24251001` -> DENIED
2. Unverified email user write on `/absensi/2026-11-23_24251001` -> DENIED
3. Non-staff authenticated user listing `/siswa` -> DENIED
4. Guru Piket (`piket`) attempting to create `/staff_roles/hacker` with `role: 'admin'` -> DENIED
5. Guru Piket attempting to delete `/siswa/24251001` -> DENIED
6. Shadow field injection (`isAdmin: true`) on `/absensi` create -> DENIED
7. Spoofed `recordedByUid` on `/absensi` create -> DENIED
8. Client-spoofed `updatedAt` timestamp (not `request.time`) -> DENIED
9. Oversized document ID (`> 128` chars) or invalid characters (`../x`) -> DENIED
10. Invalid attendance status (`"Bolos"`) on `/absensi` -> DENIED
11. Orphaned attendance record for non-existent student NIS -> DENIED
12. Cross-user update changing immutable `createdByUid` on `/staff_roles` -> DENIED
