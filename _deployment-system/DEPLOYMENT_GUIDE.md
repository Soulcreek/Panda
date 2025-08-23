# PANDA DEPLOYMENT GUIDE
*Funktionierender Prozess - Stand: August 2025*

## 🚀 **DEPLOYMENT ÜBERBLICK**

### ✅ **Was funktioniert:**
- **Critical Hotfix Deployment**: Sofortige Fehlerbehebung für kritische Dateien
- **FTP Upload System**: Direkte File-Uploads ohne komplexe Middleware
- **Selective Deployment**: Nur geänderte/kritische Dateien uploaden

### ❌ **Was NICHT funktioniert:**
- **Komplexe Master-Deploy Scripts** mit vielen Abhängigkeiten
- **Parallele Deployments** (FTP Connection Conflicts)  
- **Component-based Deployment** (zu abstrakt)

---

## 🛠️ **WORKING DEPLOYMENT SCRIPTS**

### 1. **Critical Hotfix Deployment** ⚡
**Datei:** `_deployment-system/hotfix-deploy.ps1`
**Zweck:** Sofortige Fehlerbehebung für kritische Template/Server-Dateien

```powershell
.\_deployment-system\hotfix-deploy.ps1        # Deploy critical files
.\_deployment-system\hotfix-deploy.ps1 -DryRun # Test deployment
```

**Deployt automatisch:**
- `server.js` (Node.js Server)
- `views/partials/*.ejs` (Header, Footer, Error Pages)  
- `views/*.ejs` (Main Templates)
- `locales/*.json` (Übersetzungen)
- `lib/*.js` (Core Libraries)

### 2. **Simple Full Deployment** 📦
**Datei:** `_deployment-system/simple-deploy.ps1`  
**Zweck:** Alle Dateien außer node_modules hochladen

```powershell
.\_deployment-system\simple-deploy.ps1 -DryRun    # Test full deployment
.\_deployment-system\simple-deploy.ps1            # Deploy everything
```

**Automatische Ausschlüsse:**
- `node_modules/` (zu groß)
- `.git/` (Versionskontrolle)
- `_deployment-system/` (Deployment-Scripts)
- `tmp/` (Temporäre Dateien)
- `package-lock.json` (NPM Lock-File)

---

## 🔧 **FTP KONFIGURATION**

### **Funktionierende Credentials:**
```env
FTP_HOST=ftp.purviewpanda.de
FTP_USER=k302164_pp  
FTP_PASSWORD=hallo.4PPFTP
FTP_ROOT=/
```

### **Connection Settings:**
- **Timeout:** 30 Sekunden
- **Binary Mode:** Aktiviert für alle Dateien
- **Directory Creation:** Automatisch bei Bedarf
- **Error Handling:** Continue on minor errors

---

## 📋 **DEPLOYMENT WORKFLOW**

### **Für kritische Bugfixes:**
1. **Änderungen lokal testen**
2. **Critical Hotfix deployen:** `.\_deployment-system\hotfix-deploy.ps1`
3. **Website testen:** https://purviewpanda.de
4. **Bei Erfolg:** Fertig ✅

### **Für größere Updates:**
1. **Dry Run testen:** `.\_deployment-system\simple-deploy.ps1 -DryRun`
2. **Deployment ausführen:** `.\_deployment-system\simple-deploy.ps1`  
3. **Vollständige Website testen**
4. **Performance prüfen**

### **Bei Deployment-Problemen:**
1. **Andere FTP-Clients schließen** (FileZilla, VS Code Extensions)
2. **PowerShell Prozesse beenden:** `Get-Process powershell | Stop-Process`
3. **Neue PowerShell Session starten**
4. **Erneut versuchen**

---

## ⚠️ **WICHTIGE REGELN**

### **FTP Connection Management:**
- **NUR EIN Deployment gleichzeitig** ausführen
- **Warten bis Deployment abgeschlossen** ist
- **Andere FTP-Verbindungen schließen** vor Deployment
- **Bei 550-Fehlern:** Directory existiert nicht - wird automatisch erstellt

### **File Handling:**
- **Encoding:** UTF-8 für alle Textdateien
- **Line Endings:** Windows CRLF wird automatisch konvertiert
- **Binary Files:** Bilder, PDFs etc. werden binär übertragen
- **Permissions:** Werden automatisch vom Server gesetzt

### **Error Recovery:**
- **Einzelne Datei fehlgeschlagen:** Manuell nachbessern
- **Directory-Fehler:** Script führt automatisch Retry aus
- **Connection Timeout:** Script versucht automatisch neu zu verbinden
- **Multiple Failures:** Deployment abbrechen und Probleme analysieren

---

## 🚨 **TROUBLESHOOTING**

### **Häufige Probleme:**

#### **550 - File not available**
```
Ursache: Remote Directory existiert nicht
Lösung: Script erstellt Directories automatisch beim nächsten Versuch
```

#### **Multiple FTP Connections**
```
Ursache: Andere Deployment läuft parallel
Lösung: Alle FTP-Clients schließen, neue PowerShell Session
```

#### **Timeout Errors**
```  
Ursache: Netzwerk instabil oder Server überlastet
Lösung: Retry nach 30 Sekunden, kleinere Batches
```

#### **Permission Denied**
```
Ursache: FTP Credentials falsch oder Server-Problem
Lösung: Credentials prüfen, Server-Status checken
```

---

## 📊 **DEPLOYMENT MONITORING**

### **Erfolg messen:**
- **Upload Count:** Erfolgreiche vs. fehlgeschlagene Dateien
- **Duration:** Normale Deployments < 10 Sekunden
- **Website Response:** https://purviewpanda.de lädt < 2 Sekunden
- **Error Logs:** Server-Logs nach Deployment prüfen

### **Performance Benchmarks:**
- **Critical Hotfix:** 12-15 Dateien in ~4-6 Sekunden
- **Simple Full Deploy:** 200+ Dateien in ~30-60 Sekunden  
- **Connection Setup:** ~1-2 Sekunden pro FTP-Verbindung
- **File Transfer:** ~100-500 KB/s je nach Dateigröße

---

## ✅ **SUCCESS CHECKLIST**

Nach jedem Deployment prüfen:

- [ ] **Website lädt:** https://purviewpanda.de
- [ ] **Navigation funktioniert:** Alle Links klickbar
- [ ] **No 500 Errors:** Keine Server-Fehler in den Logs
- [ ] **Responsive Design:** Mobile/Desktop korrekt
- [ ] **Forms Working:** Login, Search, etc. funktional
- [ ] **Media Loading:** Bilder und Assets laden
- [ ] **JavaScript Active:** Interaktive Features funktionieren

---

## 🎯 **NEXT STEPS**

### **Deployment System verbessern:**
1. **Automated Testing:** Pre-deployment checks
2. **Rollback Mechanism:** Automatische Wiederherstellung bei Fehlern
3. **Staging Environment:** Test-Deployment vor Production
4. **CI/CD Integration:** Automatische Deployments bei Git Push

### **Monitoring erweitern:**
1. **Health Checks:** Automatische Website-Tests nach Deployment
2. **Performance Monitoring:** Response Time Tracking
3. **Error Alerting:** Benachrichtigung bei kritischen Fehlern
4. **Deployment Logs:** Detaillierte Protokollierung

---

*Deployment Guide erstellt am 23. August 2025*
*Basierend auf erfolgreichem Critical Hotfix Deployment*
