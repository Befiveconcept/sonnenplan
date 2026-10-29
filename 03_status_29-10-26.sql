-- Status-Liste 29.10.26 → Projekt-Notizen + To-Dos
-- Im Supabase SQL Editor ausführen (alles markieren, „Run“). Mehrfaches Ausführen ist harmlos:
-- Notizen werden nur angehängt, wenn sie noch nicht drinstehen; To-Dos nur angelegt, wenn es sie noch nicht gibt.
begin;

-- Hilfsfunktion nur für dieses Skript: Zeile an p.notes anhängen (wenn noch nicht vorhanden)
create or replace function pg_temp.add_note(pid text, line text) returns void language sql as $f$
  update public.docs
     set data = jsonb_set(data, '{notes}', to_jsonb(
           case when coalesce(data->>'notes','') = '' then '' else rtrim(data->>'notes', E' \n') || E'\n' end || line))
   where coll = 'projects' and id = pid
     and position(substr(line, 1, 80) in coalesce(data->>'notes','')) = 0;
$f$;

-- ===== Projekt-Notizen 29.10.26 =====
select pg_temp.add_note('xl-apollo-fernwirkanlage-eph1', $t$29.10.26 (EP): Billotin hat Unterlagen geschickt und die Anlage da liegen, schaffen es nicht sie vorbeizubringen, dann holt MK sie ab. Gritec sagte die Standardmäßige ist zu klein, haben Maße geschickt und die prüfen, ob es ein anderes Modell gibt. MK hat bei Möhlich angefragt.$t$);
select pg_temp.add_note('xl-baumann-winterberg', $t$29.10.26 (EP): Wir machen ein Angebot. Möchten Chip für Mitarbeiter, Flottenabrechnung. Lan Anschluss-Kabel müssen noch angeschlossen werden.$t$);
select pg_temp.add_note('xl-2500128-energiepark-heimatblick', $t$29.10.26 (EP): Der letzte Zwischenweg wird 1,70m gebaut statt 1,50, da der Pfosten bei 90 steht. Stadt Bornheim hat letzte Woche Dienstag beauftragt. Baumann macht exakten Plan bzgl. Kurve, die Ecke müsste ausgekoffert und verdichtet werden. Er macht auch Angebot für zwei Kran-Hübe. Herrn Sieche & Reinecke (IVR) darüber informieren, dass Änderungen kommen werden (JS) und wann kommt der Trafo und herausfinden welche Kabelschuhe beim Trafo benötigt werden. Müssen noch den Eigentümer kontaktieren, bzgl. des Felds. WR werden heute fertig.$t$);
select pg_temp.add_note('xl-2500226-kreifelts-franz', $t$29.10.26 (EP): Gerüstturm weg? Gestell aufgebaut Kreifelts? (MK). Kabelschuhe sind da. Fundament für Speicher ist fertig. Mit Kreifelts abstimmen, ob er den Speicher da hinstellen kann oder ob wir das machen und dafür Manitou bestellen müssen.$t$);
select pg_temp.add_note('xl-2600054-lindenstrasse-siegburg', $t$29.10.26 (EP): Nächste Woche startet dann der Anwalt.$t$);
select pg_temp.add_note('xl-marienheide-mh90', $t$29.10.26 (EP): Heute Angebot von UESA (Wandlerschrank), Schrankzeichnung an den Energieversorger schicken (MK).$t$);
select pg_temp.add_note('xl-remagen-nadja', $t$29.10.26 (EP): Reminder an Architekten (MK).$t$);
select pg_temp.add_note('xl-robert-bosch-strasse', $t$29.10.26 (EP): Nächste Woche neue Anfrage (über VESA) MK.$t$);
select pg_temp.add_note('xl-2500155-schwarzkopf-rolf', $t$29.10.26 (EP): Haben Unterschrift, müsste Schlussrechnung bezahlt haben.$t$);
select pg_temp.add_note('xl-24-02129-strundepark-geb-2-1-2-5-graf', $t$29.10.26 (EP): Gebäude 5 Zählereinbau erfolgt. Warten auf Termin wann wir Gebäude 2 abschalten dürfen. Hendrik baut nach Urlaub Logger etc. ein in Gebäude 5.$t$);
select pg_temp.add_note('xl-2600058-thomasberg-solarpark', $t$29.10.26 (EP): Nächste Woche Anwalt.$t$);
select pg_temp.add_note('xl-udo-bois', $t$29.10.26 (EP): Kleines technisches Problem noch (Montag MK, Hendrik).$t$);
select pg_temp.add_note('xl-2600055-wehrstrasse-hennef', $t$29.10.26 (EP): Nächste Woche Anwalt.$t$);
select pg_temp.add_note('xl-wirtz-agrar', $t$29.10.26 (EP): MK kriegt Moritz nicht ans Telefon.$t$);
select pg_temp.add_note('xl-zusestrasse', $t$29.10.26 (EP): Keine Rückmeldung.$t$);
select pg_temp.add_note('xl-haus-venusberg', $t$29.10.26 (EP): Sicherungsgrößen sind im Plan nicht eingetragen und es fehlt die Messung für die neuen Kabel.$t$);

-- ===== To-Dos aus den Notizen vom 29.10.26 =====
-- Zuständig nur, wenn im Eintrag genannt; sonst „niemand“ (in der App zuweisen).
insert into public.docs (coll, id, data) values
('tasks','tk-2910-01',$j${"id":"tk-2910-01","pid":"xl-apollo-fernwirkanlage-eph1","title":"Anlage bei Billotin abholen (schaffen es nicht, sie vorbeizubringen)","who":"Marc Krebber (MK)","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-02',$j${"id":"tk-2910-02","pid":"xl-apollo-fernwirkanlage-eph1","title":"USV: Antwort von Möhlich und Gritec (größeres Modell) nachhalten","who":"Marc Krebber (MK)","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-03',$j${"id":"tk-2910-03","pid":"xl-baumann-winterberg","title":"Angebot erstellen: Ladelösung mit Mitarbeiter-Chip und Flottenabrechnung","who":"","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-04',$j${"id":"tk-2910-04","pid":"xl-baumann-winterberg","title":"LAN-Anschlusskabel anschließen","who":"","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-05',$j${"id":"tk-2910-05","pid":"xl-2500128-energiepark-heimatblick","title":"Herrn Sieche & Reinecke (IVR) informieren, dass Änderungen kommen","who":"Jörg Stumpen (JS)","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-06',$j${"id":"tk-2910-06","pid":"xl-2500128-energiepark-heimatblick","title":"Klären, wann der Trafo kommt und welche Kabelschuhe beim Trafo benötigt werden","who":"Jörg Stumpen (JS)","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-07',$j${"id":"tk-2910-07","pid":"xl-2500128-energiepark-heimatblick","title":"Feldeigentümer kontaktieren (bzgl. des Felds)","who":"","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-08',$j${"id":"tk-2910-08","pid":"xl-2500128-energiepark-heimatblick","title":"Plan Kurve und Angebot für zwei Kran-Hübe von Baumann nachhalten","who":"","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-09',$j${"id":"tk-2910-09","pid":"xl-2500226-kreifelts-franz","title":"Prüfen: Gerüstturm weg? Gestell bei Kreifelts aufgebaut?","who":"Marc Krebber (MK)","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-10',$j${"id":"tk-2910-10","pid":"xl-2500226-kreifelts-franz","title":"Mit Kreifelts abstimmen, wer den Speicher aufstellt (sonst Manitou bestellen)","who":"","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-11',$j${"id":"tk-2910-11","pid":"xl-marienheide-mh90","title":"Schrankzeichnung (UESA-Wandlerschrank) an den Energieversorger schicken","who":"Marc Krebber (MK)","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-12',$j${"id":"tk-2910-12","pid":"xl-remagen-nadja","title":"Reminder an den Architekten schicken","who":"Marc Krebber (MK)","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-13',$j${"id":"tk-2910-13","pid":"xl-robert-bosch-strasse","title":"Neue Anschlussanfrage über VESA stellen","who":"Marc Krebber (MK)","due":"2026-11-06","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-14',$j${"id":"tk-2910-14","pid":"xl-2500155-schwarzkopf-rolf","title":"Prüfen, ob die Schlussrechnung bezahlt ist","who":"","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-15',$j${"id":"tk-2910-15","pid":"xl-24-02129-strundepark-geb-2-1-2-5-graf","title":"Termin für die Abschaltung von Gebäude 2 nachhalten","who":"","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-16',$j${"id":"tk-2910-16","pid":"xl-24-02129-strundepark-geb-2-1-2-5-graf","title":"Logger etc. in Gebäude 5 einbauen (nach dem Urlaub)","who":"Hendrik Heuser (HH)","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-17',$j${"id":"tk-2910-17","pid":"xl-udo-bois","title":"Kleines technisches Problem beheben (Montag, mit Hendrik)","who":"Marc Krebber (MK)","due":"2026-11-02","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-18',$j${"id":"tk-2910-18","pid":"xl-wirtz-agrar","title":"Moritz Wirtz erneut anrufen","who":"Marc Krebber (MK)","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb),
('tasks','tk-2910-19',$j${"id":"tk-2910-19","pid":"xl-haus-venusberg","title":"Sicherungsgrößen im Plan eintragen und Messung für die neuen Kabel durchführen","who":"","prio":"normal","done":false,"src":"status-liste","created":"2026-10-29","at":"2026-10-29T10:00:00.000Z","by":"EP"}$j$::jsonb)
on conflict (coll, id) do nothing;

commit;

-- Kontrolle
select id, data->>'name' as projekt from public.docs where coll='projects' and data->>'notes' like '%29.10.26 (EP):%' order by 2;
select data->>'title' as todo, data->>'who' as wer from public.docs where coll='tasks' and id like 'tk-2910-%' order by id;
