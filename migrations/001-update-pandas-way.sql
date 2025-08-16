-- DBNAME: site_content.db
-- Migration 001: Aktualisiert die Inhalte für "The Panda's Way" mit reichhaltigem, animiertem HTML.

-- Update für Level 1
UPDATE pandas_way_content
SET content = '
<div class="container-fluid basics-section bg-light">
    <div class="container">
        <div class="row text-center">
            <div class="col-12" data-aos="fade-up">
                <h2 class="display-5">Deine Daten sind wie ein Schatz!</h2>
                <p class="lead text-muted mb-5">Und so passen wir gut darauf auf, Schritt für Schritt:</p>
            </div>
        </div>
        <div class="row text-center">
            <div class="col-md-4" data-aos="fade-up" data-aos-delay="100">
                <div class="p-4">
                    <div class="basics-icon mx-auto"><i class="bi bi-list-check"></i></div>
                    <h3>Die Regeln</h3>
                    <p>Wir legen fest, wer deinen Schatz ansehen darf. Genau wie du entscheidest, wer mit deinem Lieblingsspielzeug spielen darf.</p>
                </div>
            </div>
            <div class="col-md-4" data-aos="fade-up" data-aos-delay="200">
                <div class="p-4">
                    <div class="basics-icon mx-auto"><i class="bi bi-shield-lock-fill"></i></div>
                    <h3>Das Schloss</h3>
                    <p>Wir packen deine Daten in eine superstarke Kiste mit einem geheimen Schloss, das nur du öffnen kannst. Das nennt man Schutz.</p>
                </div>
            </div>
            <div class="col-md-4" data-aos="fade-up" data-aos-delay="300">
                <div class="p-4">
                    <div class="basics-icon mx-auto"><i class="bi bi-bank"></i></div>
                    <h3>Das Gesetz</h3>
                    <p>Wir halten uns an die Gesetze, damit alles fair und sicher bleibt. So sind deine Daten immer gut und richtig geschützt.</p>
                </div>
            </div>
        </div>
    </div>
</div>
<div class="container-fluid basics-section">
    <div class="container">
        <div class="row align-items-center g-5">
            <div class="col-md-6" data-aos="fade-right">
                <img src="/uploads/1755285422394-Panda_Lurk.png" class="img-fluid rounded" alt="Panda schaut über eine Kante">
            </div>
            <div class="col-md-6" data-aos="fade-left">
                <h4><i class="bi bi-eye-slash-fill text-primary me-2"></i>Privat bleibt privat</h4>
                <p>Wir sorgen dafür, dass niemand heimlich auf deine Daten schaut. Dein digitales Tagebuch ist nur für dich.</p>
            </div>
        </div>
        <div class="row align-items-center g-5 mt-5">
            <div class="col-md-6 order-md-2" data-aos="fade-left">
                <img src="/uploads/1755283305724-Panda_Sleep.png" class="img-fluid rounded" alt="Schlafender Panda">
            </div>
            <div class="col-md-6 order-md-1" data-aos="fade-right">
                <h4><i class="bi bi-shield-check text-primary me-2"></i>Sicher im Internet</h4>
                <p>Wenn du online bist, passen wir auf, dass keine "Daten-Diebe" an deine Informationen kommen. So kannst du sicher surfen.</p>
            </div>
        </div>
    </div>
</div>
'
WHERE level = 1 AND lang = 'de';

-- Update für Level 2 (BLEIBT UNVERÄNDERT)
UPDATE pandas_way_content
SET content = '
<div class="container-fluid basics-section bg-light">
    <div class="container">
        <div class="row text-center">
            <div class="col-12" data-aos="fade-up">
                <h2 class="display-5">Alles beginnt mit den 3 Säulen</h2>
                <p class="lead text-muted mb-5">Stellen Sie sich Ihre Daten wie einen Schatz vor. Um ihn zu schützen, brauchen Sie drei Dinge:</p>
            </div>
        </div>
        <div class="row text-center">
            <div class="col-md-4" data-aos="fade-up" data-aos-delay="100">
                <div class="p-4">
                    <div class="basics-icon mx-auto mb-3"><i class="bi bi-diagram-3-fill"></i></div>
                    <h3>Data Governance</h3>
                    <p class="fw-bold text-primary">Die Spielregeln</p>
                    <p>Wer ist für den Schatz verantwortlich? Wer darf ihn ansehen? Hier legen Sie die Strategie und die Verantwortlichkeiten fest.</p>
                </div>
            </div>
            <div class="col-md-4" data-aos="fade-up" data-aos-delay="200">
                <div class="p-4">
                    <div class="basics-icon mx-auto mb-3"><i class="bi bi-shield-lock-fill"></i></div>
                    <h3>Data Security</h3>
                    <p class="fw-bold text-primary">Die Burgmauern</p>
                    <p>Das sind die aktiven Schutzmaßnahmen: die Mauern, die Wachen und die Alarmsysteme, die den Schatz vor Dieben schützen.</p>
                </div>
            </div>
            <div class="col-md-4" data-aos="fade-up" data-aos-delay="300">
                <div class="p-4">
                    <div class="basics-icon mx-auto mb-3"><i class="bi bi-bank"></i></div>
                    <h3>Data Compliance</h3>
                    <p class="fw-bold text-primary">Das Gesetzbuch</p>
                    <p>Welche Gesetze (z.B. DSGVO) müssen Sie befolgen? Hier stellen Sie sicher, dass Ihr Umgang mit dem Schatz legal ist.</p>
                </div>
            </div>
        </div>
    </div>
</div>
<div class="container-fluid basics-section">
    <div class="container">
        <div class="row text-center">
            <div class="col-12" data-aos="fade-up">
                <h2 class="display-5">Zoomen wir in die Burgmauern hinein</h2>
                <p class="lead text-muted mb-5">"Data Security" selbst besteht aus mehreren Verteidigungsringen:</p>
            </div>
        </div>
        <div class="row align-items-center g-5">
            <div class="col-md-6" data-aos="fade-right">
                <img src="/uploads/1755265778258-Gemini_Generated_Image_inhgq5inhgq5inhg.png" class="img-fluid rounded shadow-lg" alt="Verschlüsselter Code">
            </div>
            <div class="col-md-6" data-aos="fade-left">
                <h4><i class="bi bi-key-fill text-primary me-2"></i>Verschlüsselung</h4>
                <p class="fw-bold">Die Geheimsprache</p>
                <p>Selbst wenn ein Dieb in die Schatzkammer gelangt, kann er die Schatztruhe nicht öffnen. Die Daten sind in einen unlesbaren Code umgewandelt, für den nur Sie den Schlüssel haben.</p>
            </div>
        </div>
        <div class="row align-items-center g-5 mt-5">
            <div class="col-md-6 order-md-2" data-aos="fade-left">
                <img src="/uploads/1755287461781-SecureDevice.png" class="img-fluid rounded shadow-lg" alt="Serverraum">
            </div>
            <div class="col-md-6 order-md-1" data-aos="fade-right">
                <h4><i class="bi bi-person-badge-fill text-primary me-2"></i>Zugriffskontrolle (IAM)</h4>
                <p class="fw-bold">Der Türsteher</p>
                <p>Nur autorisierte Personen dürfen die Burg überhaupt betreten. Identity and Access Management (IAM) stellt sicher, dass jeder nur das sieht und tun kann, wofür er die Erlaubnis hat.</p>
            </div>
        </div>
    </div>
</div>
'
WHERE level = 2 AND lang = 'de';

-- Update für Level 3
UPDATE pandas_way_content
SET content = '
<div class="container-fluid basics-section bg-light">
    <div class="container">
        <div class="row text-center" data-aos="fade-up">
            <div class="col-lg-8 mx-auto">
                <h2 class="display-5">Das Framework der Datensicherheit</h2>
                <p class="lead text-muted mb-5">Die drei Säulen bilden ein Framework, das technische und organisatorische Maßnahmen vereint.</p>
            </div>
        </div>
        <div class="row">
            <div class="col-md-6" data-aos="fade-right">
                <h3><i class="bi bi-diagram-3-fill text-primary me-2"></i>Data Governance</h3>
                <p>Hier definieren Sie Richtlinien über den gesamten Datenlebenszyklus (Erstellung, Speicherung, Nutzung, Archivierung, Löschung). Es geht um die Zuweisung von Verantwortlichkeiten (Data Owner, Data Steward) und die Etablierung von Prozessen zur Datenqualitätssicherung.</p>
            </div>
            <div class="col-md-6" data-aos="fade-left">
                <h3><i class="bi bi-shield-lock-fill text-primary me-2"></i>Data Security</h3>
                <p>Dies ist die technische Umsetzung der Governance-Vorgaben. Zentrale Prinzipien sind:</p>
                <ul class="list-unstyled">
                    <li><i class="bi bi-check-circle-fill text-success me-2"></i><strong>Verschlüsselung:</strong> Schutz von "Data at Rest" (z.B. via BitLocker, TDE) und "Data in Transit" (TLS 1.2+).</li>
                    <li><i class="bi bi-check-circle-fill text-success me-2"></i><strong>Identity & Access Management (IAM):</strong> Umsetzung des "Least Privilege"-Prinzips durch rollenbasierte Zugriffskontrolle (RBAC).</li>
                    <li><i class="bi bi-check-circle-fill text-success me-2"></i><strong>Netzwerksicherheit:</strong> Firewalls, IDS/IPS und Micro-Segmentation zur Kontrolle des Datenflusses.</li>
                </ul>
            </div>
        </div>
    </div>
</div>
<div class="container-fluid basics-section">
    <div class="container">
        <div class="row align-items-center g-5" data-aos="zoom-in-up">
            <div class="col-md-6">
                <img src="/uploads/1755291517696-Panda_Label.png" class="img-fluid" alt="Panda mit einem Dokumenten-Label">
            </div>
            <div class="col-md-6">
                <h3><i class="bi bi-braces text-primary me-2"></i>Die Rolle von Microsoft Purview</h3>
                <p>Tools wie <strong>Microsoft Purview</strong> sind entscheidend, um Governance und Security zu verbinden. Purview agiert als zentrale Instanz für:</p>
                <ul>
                    <li><strong>Data Discovery & Classification:</strong> Automatisches Scannen von Datenquellen (On-Prem, M365, Azure, AWS) und Klassifizieren von sensiblen Informationen (z.B. personenbezogene Daten).</li>
                    <li><strong>Information Protection:</strong> Anwenden von "Sensitivity Labels", die Schutzmaßnahmen wie Verschlüsselung an die Daten heften – egal, wo sie sich befinden.</li>
                </ul>
            </div>
        </div>
        <div class="row mt-5 text-center" data-aos="fade-up">
            <div class="col-12">
                 <h3><i class="bi bi-bank text-primary me-2"></i>Data Compliance</h3>
                 <p>Diese Säule stellt sicher, dass alle Maßnahmen den regulatorischen Anforderungen (DSGVO, NIS2) genügen. Purview unterstützt dies durch detaillierte Audit-Logs, Berichte und das "Compliance Manager"-Tool, das den Reifegrad der Organisation bewertet.</p>
            </div>
        </div>
    </div>
</div>
'
WHERE level = 3 AND lang = 'de';

-- Update für Level 4
UPDATE pandas_way_content
SET content = '
<div class="container-fluid basics-section bg-light">
    <div class="container">
        <div class="row text-center" data-aos="fade-up">
            <div class="col-lg-10 mx-auto">
                <h2 class="display-5">Moderne Datensicherheit: Zero Trust & Risikobasierung</h2>
                <p class="lead text-muted">Die klassischen Säulen bleiben, doch die Umsetzung wird adaptiv und geht von einem "compromised state" aus. Das Motto lautet: "Never trust, always verify".</p>
            </div>
        </div>
    </div>
</div>
<div class="container-fluid basics-section">
    <div class="container">
        <div class="row align-items-center g-5" data-aos="fade-right">
            <div class="col-md-7">
                <h3 class="mb-3"><i class="bi bi-shield-shaded text-primary me-2"></i>Fokus: Data Security im Zero-Trust-Modell</h3>
                <p>Die moderne Sicherheitsstrategie verlagert sich von einem perimetrischem Schutz zu einer identitätsbasierten Architektur. Jede Anfrage wird als potenziell feindlich eingestuft und muss verifiziert werden. Microsoft Purview ist hierbei ein zentrales Werkzeug:</p>
            </div>
            <div class="col-md-5" data-aos="fade-left">
                 <img src="/uploads/1755284771544-Panda_Shield.png" class="img-fluid" alt="Panda mit einem Schutzschild">
            </div>
        </div>
        <div class="row g-4 mt-4">
            <div class="col-md-4" data-aos="fade-up" data-aos-delay="100">
                <h5>Information Protection</h5>
                <p>Purview klassifiziert Daten automatisch (z.B. "Intern Vertraulich") und wendet persistente Schutzmaßnahmen an (Verschlüsselung, Wasserzeichen). Dieser Schutz reist mit der Datei, egal wohin sie geht.</p>
            </div>
            <div class="col-md-4" data-aos="fade-up" data-aos-delay="200">
                <h5>Data Loss Prevention (DLP)</h5>
                <p>Purview DLP überwacht Endpunkte, Apps und Dienste, um die unerlaubte Weitergabe sensibler Daten zu verhindern. Richtlinien können z.B. das Kopieren auf USB-Sticks oder den Versand an private E-Mails blockieren.</p>
            </div>
            <div class="col-md-4" data-aos="fade-up" data-aos-delay="300">
                <h5>Insider Risk Management</h5>
                <p>Analysiert Benutzeraktivitäten (z.B. hohe Download-Raten), um potenzielle interne Risiken – ob böswillig oder versehentlich – frühzeitig zu erkennen und darauf zu reagieren.</p>
            </div>
        </div>
    </div>
</div>
<div class="container-fluid basics-section bg-light">
    <div class="container">
        <div class="row align-items-center g-5" data-aos="fade-up">
             <div class="col-md-5" data-aos="fade-right">
                 <img src="/uploads/1755288515495-Panda_Knight.png" class="img-fluid" alt="Panda als Ritter">
            </div>
            <div class="col-md-7">
                <h3 class="mb-3"><i class="bi bi-bank text-primary me-2"></i>Fokus: Data Compliance in der Praxis</h4>
                <p>Compliance ist kein einmaliges Projekt, sondern ein kontinuierlicher Prozess. Wichtige Frameworks sind:</p>
                <ul>
                    <li><strong>NIS2 (Network and Information Security Directive 2):</strong> Erhöht die Anforderungen an die Cyber-Resilienz für Betreiber kritischer Infrastrukturen in der EU. Dies erfordert robuste Incident-Response-Pläne, regelmäßige Risikobewertungen und sichere Lieferketten.</li>
                    <li><strong>ISO/IEC 27001:</strong> Ein international anerkannter Standard für Informationssicherheits-Managementsysteme (ISMS). Er bietet einen systematischen Ansatz zur Verwaltung sensibler Unternehmensinformationen, um deren Sicherheit zu gewährleisten. Purview hilft bei der Umsetzung vieler technischer Kontrollen, die für eine Zertifizierung erforderlich sind.</li>
                </ul>
            </div>
        </div>
    </div>
</div>
'
WHERE level = 4 AND lang = 'de';
