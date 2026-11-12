// MOMOYO Live - pemasang + pelepas (satu exe). Per pengguna, tanpa hak admin. C# 5 / .NET Framework 4.5+.
// Mode:  (tanpa argumen) pasang/perbarui   |  /uninstall  lepas   |  /S senyap   |  /dir:PATH   |  /nolaunch
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("MOMOYO Live Setup")]
[assembly: AssemblyProduct("MOMOYO Live")]
[assembly: AssemblyVersion("@VERSION@.0")]
[assembly: AssemblyFileVersion("@VERSION@.0")]

static class Installer
{
    const string Version = "@VERSION@";
    const string AppName = "MOMOYO Live";
    const string ZipPrefix = "MOMOYO Live/app/";
    const string Marker = ".momoyo-install";
    const string UninstallExe = "Uninstall MOMOYO Live.exe";
    const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\MOMOYO Live";
    // Data operator yang dipertahankan saat upgrade / uninstall (pilihan "simpan data").
    static readonly string[] Keep = { "data", "giveaway-state.json", "podium-state.json", "launcher.log" };

    static bool silent;
    static bool noLaunch;
    static bool force;
    static string dirOverride;
    static string startMenuOverride;
    static string logFile;

    [STAThread]
    public static void Log(string text)
    {
        try { File.AppendAllText(Path.Combine(Path.GetTempPath(), "MOMOYO-setup.log"), DateTime.Now.ToString("s") + " " + text + "\r\n"); } catch { }
    }

    public static int Run(string[] args)
    {
        bool uninstall = false;
        string from = null;
        foreach (string a in args)
        {
            string l = a.ToLowerInvariant();
            if (l == "/s" || l == "/silent" || l == "--silent") silent = true;
            else if (l == "/nolaunch") noLaunch = true;
            else if (l == "/force") force = true;
            else if (l == "/uninstall" || l == "--uninstall") uninstall = true;
            else if (l.StartsWith("/dir:")) dirOverride = a.Substring(5).Trim(new char[] { '"' });
            else if (l.StartsWith("/startmenu:")) startMenuOverride = a.Substring(11).Trim(new char[] { '"' });
            else if (l.StartsWith("/from:")) from = a.Substring(6).Trim(new char[] { '"' });
            else if (l == "/keepdata") keepFlag = 1;
            else if (l == "/deletedata") keepFlag = 2;
        }
        if (Path.GetFileName(Assembly.GetExecutingAssembly().Location)
                .StartsWith("Uninstall", StringComparison.OrdinalIgnoreCase)) uninstall = true;
        try
        {
            return uninstall ? RunUninstall(from) : RunInstall();
        }
        catch (Exception e)
        {
            Log("ERROR " + e);
            Fail(e.Message);
            return 1;
        }
    }

    static int keepFlag; // 0 = tanya, 1 = simpan data, 2 = hapus data (untuk /S)

    // ---------- util ----------
    static void Info(string text) { if (silent) Console.WriteLine(text); else MessageBox.Show(text, AppName, MessageBoxButtons.OK, MessageBoxIcon.Information); }
    static void Fail(string text) { if (silent) Console.Error.WriteLine("ERROR: " + text); else MessageBox.Show(text, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error); }
    static DialogResult Ask(string text, MessageBoxButtons buttons, MessageBoxIcon icon, MessageBoxDefaultButton def)
    {
        return MessageBox.Show(text, AppName, buttons, icon, def);
    }

    static string DefaultDir()
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(local, "MOMOYO");
    }

    static string StartMenuDir()
    {
        return startMenuOverride ?? Environment.GetFolderPath(Environment.SpecialFolder.Programs);
    }

    static byte[] Resource(string name)
    {
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
        {
            if (s == null) throw new InvalidOperationException("Berkas pemasang rusak (" + name + ").");
            using (MemoryStream m = new MemoryStream()) { s.CopyTo(m); return m.ToArray(); }
        }
    }

    static string Norm(string p) { return Path.GetFullPath(p).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar); }

    static bool IsUnder(string child, string parent)
    {
        string c = Norm(child), p = Norm(parent);
        StringComparison cmp = Path.DirectorySeparatorChar == '\\' ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        return c.Equals(p, cmp) || c.StartsWith(p + Path.DirectorySeparatorChar, cmp);
    }

    // Folder yang aman dipasangi / dihapus: bukan akar drive, bukan profil, bukan folder sistem.
    static void GuardDir(string dir)
    {
        string full = Norm(dir);
        string root = Path.GetPathRoot(full);
        if (string.IsNullOrEmpty(full) || full.Length <= (root ?? "").TrimEnd('\\', '/').Length)
            throw new InvalidOperationException("Folder tujuan tidak aman: " + dir);
        string[] special = {
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.Windows)
        };
        foreach (string s in special)
            if (!string.IsNullOrEmpty(s) && Norm(s).Equals(full, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Folder tujuan tidak aman: " + dir);
    }

    // ---------- server ----------
    class ServerInfo { public string Root; public int Pid; public string Version; }

    static ServerInfo Health()
    {
        try
        {
            HttpWebRequest r = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:8766/api/health");
            r.Proxy = null; r.Timeout = 700; r.ReadWriteTimeout = 700;
            using (WebResponse w = r.GetResponse())
            using (StreamReader sr = new StreamReader(w.GetResponseStream(), Encoding.UTF8))
            {
                string j = sr.ReadToEnd();
                if (!j.Contains("momoyo-obs-v2")) return null;
                ServerInfo i = new ServerInfo();
                Match m = Regex.Match(j, "\"root\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
                if (m.Success) i.Root = Regex.Unescape(m.Groups[1].Value);
                m = Regex.Match(j, "\"pid\"\\s*:\\s*(\\d+)");
                if (m.Success) i.Pid = int.Parse(m.Groups[1].Value);
                m = Regex.Match(j, "\"version\"\\s*:\\s*\"([^\"]*)\"");
                if (m.Success) i.Version = m.Groups[1].Value;
                return i;
            }
        }
        catch { return null; }
    }

    // Hentikan server MOMOYO hanya bila berjalan dari folder pemasangan ini. Mengembalikan true bila port bebas / bukan milik kita.
    static bool StopServerIn(string dir)
    {
        ServerInfo i = Health();
        if (i == null || string.IsNullOrEmpty(i.Root) || i.Pid <= 0) return true;
        if (!IsUnder(i.Root, dir)) return true; // MOMOYO folder lain: jangan disentuh dari sini
        try { Process.GetProcessById(i.Pid).Kill(); } catch { }
        for (int n = 0; n < 40; n++)
        {
            if (Health() == null) { Thread.Sleep(300); return true; }
            Thread.Sleep(150);
        }
        return false;
    }

    // ---------- pasang ----------
    static int RunInstall()
    {
        string dir = Norm(dirOverride ?? DefaultDir());
        GuardDir(dir);
        bool exists = Directory.Exists(dir) && Directory.GetFileSystemEntries(dir).Length > 0;
        bool installed = exists && File.Exists(Path.Combine(dir, "launcher.py"));
        if (exists && !installed && !DataOnly(dir))
            throw new InvalidOperationException("Folder MOMOYO sudah ada, tetapi aplikasi tidak lengkap. Pindahkan folder itu sebelum memasang:\n" + dir);

        string oldVersion = installed ? ActiveVersion(dir) : null;
        if (installed && oldVersion != null && Compare(oldVersion, Version) > 0 && !force)
        {
            string msg = "Versi yang terpasang (" + oldVersion + ") lebih baru daripada pemasang ini (" + Version + ").";
            if (silent) throw new InvalidOperationException(msg + " Gunakan /force untuk menurunkan versi.");
            if (Ask(msg + "\n\nMenurunkan versi tidak disarankan. Tetap lanjutkan?", MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return 0;
        }
        if (!silent)
        {
            string q = installed
                ? (oldVersion == Version
                    ? "MOMOYO Live " + Version + " sudah terpasang.\nPasang ulang? Data peserta dan status giveaway tetap dipertahankan."
                    : "MOMOYO Live " + (oldVersion ?? "(versi lama)") + " sudah terpasang.\nPerbarui ke " + Version + "? Data peserta dan status giveaway tetap dipertahankan.")
                : "Pasang MOMOYO Live " + Version + " untuk akun Windows ini?\n\nLokasi: " + dir + "\nTidak perlu hak administrator.";
            if (Ask(q, MessageBoxButtons.OKCancel, MessageBoxIcon.Question, MessageBoxDefaultButton.Button1) != DialogResult.OK) return 0;
        }

        if (installed)
        {
            ServerInfo run = Health();
            if (run != null && !string.IsNullOrEmpty(run.Root) && IsUnder(run.Root, dir))
            {
                if (!silent && Ask("MOMOYO yang terpasang sedang berjalan" + (run.Version != null ? " (versi " + run.Version + ")" : "") + ".\nHentikan lalu perbarui? Jika sedang LIVE, tunggu sampai giveaway selesai.",
                        MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return 0;
                if (!StopServerIn(dir)) throw new InvalidOperationException("Server MOMOYO belum berhenti. Jalankan Tutup MOMOYO Live lalu coba lagi.");
            }
        }

        string parent = Path.GetDirectoryName(dir);
        Directory.CreateDirectory(parent);
        string stage = dir + ".new";
        string backup = dir + ".old";
        if (Directory.Exists(stage)) Directory.Delete(stage, true);
        if (Directory.Exists(backup)) Directory.Delete(backup, true);

        // 1) ekstrak ke staging dan periksa kelengkapan
        Directory.CreateDirectory(stage);
        try
        {
            ExtractTo(stage);
            if (!File.Exists(Path.Combine(stage, "launcher.py")) || !File.Exists(Path.Combine(stage, "python", "pythonw.exe")))
                throw new InvalidOperationException("Paket aplikasi tidak lengkap. Unduh ulang pemasang.");
            File.WriteAllText(Path.Combine(stage, Marker), Version + "\r\n");
            File.WriteAllBytes(Path.Combine(stage, "MOMOYO.ico"), Resource("MOMOYO.ico"));
            File.Copy(Assembly.GetExecutingAssembly().Location, Path.Combine(stage, UninstallExe), true);
        }
        catch { TryDelete(stage); throw; }

        // 2) tukar: lama -> .old, baru -> dir, lalu kembalikan data
        bool swapped = false;
        try
        {
            if (Directory.Exists(dir)) { Directory.Move(dir, backup); swapped = true; }
            Directory.Move(stage, dir);
            if (swapped)
                foreach (string k in Keep)
                {
                    string src = Path.Combine(backup, k), dst = Path.Combine(dir, k);
                    if (Directory.Exists(src)) { if (Directory.Exists(dst)) Directory.Delete(dst, true); Directory.Move(src, dst); }
                    else if (File.Exists(src)) { File.Copy(src, dst, true); }
                }
        }
        catch (Exception e)
        {
            // kembalikan versi lama bila tukar gagal
            try { if (swapped) { if (Directory.Exists(dir)) Directory.Delete(dir, true); Directory.Move(backup, dir); } } catch { }
            TryDelete(stage);
            throw new InvalidOperationException("Pemasangan dibatalkan, versi lama dipulihkan. Pastikan MOMOYO tidak sedang berjalan.\n" + e.Message);
        }
        TryDelete(backup);

        // 3) shortcut + registri
        string note = "";
        try { MakeShortcuts(dir); } catch (Exception e) { note += "\nShortcut Start Menu gagal dibuat: " + e.Message; }
        try { WriteRegistry(dir); } catch (Exception e) { note += "\nEntri Uninstall gagal ditulis: " + e.Message; }

        string done = (installed ? "MOMOYO Live diperbarui ke " : "MOMOYO Live ") + Version + (installed ? "." : " terpasang.") + note;
        if (silent) { Console.WriteLine(done); return 0; }
        if (Ask(done + "\n\nBuka sekarang?", MessageBoxButtons.YesNo, MessageBoxIcon.Information, MessageBoxDefaultButton.Button1) == DialogResult.Yes && !noLaunch)
            Launch(dir);
        return 0;
    }

    // Sisa uninstall dengan "simpan data": hanya berisi data operator, aman dipasang ulang di atasnya.
    static bool DataOnly(string dir)
    {
        foreach (string e in Directory.GetFileSystemEntries(dir))
            if (Array.IndexOf(Keep, Path.GetFileName(e)) < 0) return false;
        return true;
    }

    // Versi yang benar-benar aktif: active.json (hasil pembaruan satu tombol) lebih diutamakan daripada VERSION.txt.
    static string ActiveVersion(string dir)
    {
        try
        {
            string j = File.ReadAllText(Path.Combine(dir, "active.json"));
            Match m = Regex.Match(j, "\"version\"\\s*:\\s*\"(\\d+\\.\\d+\\.\\d+)\"");
            if (m.Success) return m.Groups[1].Value;
        }
        catch { }
        return ReadVersion(dir);
    }

    static int Compare(string a, string b)
    {
        Version va, vb;
        if (!System.Version.TryParse(a, out va) || !System.Version.TryParse(b, out vb)) return 0;
        return va.CompareTo(vb);
    }

    static string ReadVersion(string dir)
    {
        try { return File.ReadAllText(Path.Combine(dir, "VERSION.txt")).Trim().Split(new char[] { ' ' })[2].TrimStart(new char[] { 'v' }); } catch { }
        try { return File.ReadAllText(Path.Combine(dir, Marker)).Trim(); } catch { }
        return null;
    }

    static void ExtractTo(string target)
    {
        string root = Norm(target) + Path.DirectorySeparatorChar;
        using (MemoryStream ms = new MemoryStream(Resource("MOMOYO.zip")))
        using (ZipArchive zip = new ZipArchive(ms, ZipArchiveMode.Read))
        {
            foreach (ZipArchiveEntry e in zip.Entries)
            {
                if (!e.FullName.StartsWith(ZipPrefix, StringComparison.Ordinal)) continue;
                string rel = e.FullName.Substring(ZipPrefix.Length);
                if (rel.Length == 0) continue;
                string path = Path.GetFullPath(Path.Combine(target, rel.Replace('/', Path.DirectorySeparatorChar)));
                if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Berkas paket tidak valid.");
                if (rel.EndsWith("/")) { Directory.CreateDirectory(path); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                using (Stream src = e.Open())
                using (FileStream dst = File.Create(path)) src.CopyTo(dst);
            }
        }
    }

    static void TryDelete(string dir) { try { if (Directory.Exists(dir)) Directory.Delete(dir, true); } catch { } }

    static void Launch(string dir)
    {
        ProcessStartInfo p = new ProcessStartInfo(Path.Combine(dir, "python", "pythonw.exe"), "\"" + Path.Combine(dir, "launcher.py") + "\"");
        p.WorkingDirectory = dir; p.UseShellExecute = false; p.CreateNoWindow = true;
        Process.Start(p);
    }

    // ---------- shortcut (COM lewat reflection; dilewati bila tidak ada, mis. di Linux) ----------
    static void MakeShortcut(string path, string target, string args, string workDir, string icon, string desc)
    {
        Type t = Type.GetTypeFromProgID("WScript.Shell");
        if (t == null) throw new NotSupportedException("WScript.Shell tidak tersedia");
        object sh = Activator.CreateInstance(t);
        object lnk = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, sh, new object[] { path });
        Type lt = lnk.GetType();
        lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { target });
        lt.InvokeMember("Arguments", BindingFlags.SetProperty, null, lnk, new object[] { args });
        lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk, new object[] { workDir });
        lt.InvokeMember("IconLocation", BindingFlags.SetProperty, null, lnk, new object[] { icon });
        lt.InvokeMember("Description", BindingFlags.SetProperty, null, lnk, new object[] { desc });
        lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
    }

    static void MakeShortcuts(string dir)
    {
        string menu = StartMenuDir();
        if (string.IsNullOrEmpty(menu)) throw new InvalidOperationException("Folder Start Menu tidak ditemukan");
        Directory.CreateDirectory(menu);
        string pyw = Path.Combine(dir, "python", "pythonw.exe");
        string launcher = "\"" + Path.Combine(dir, "launcher.py") + "\"";
        string ico = Path.Combine(dir, "MOMOYO.ico");
        MakeShortcut(Path.Combine(menu, "MOMOYO Live.lnk"), pyw, launcher, dir, ico, "Buka panel operator MOMOYO Live");
        MakeShortcut(Path.Combine(menu, "Tutup MOMOYO Live.lnk"), pyw, launcher + " --stop", dir, ico, "Hentikan server MOMOYO Live");
    }

    static void RemoveShortcuts()
    {
        string menu = StartMenuDir();
        if (string.IsNullOrEmpty(menu)) return;
        foreach (string n in new[] { "MOMOYO Live.lnk", "Tutup MOMOYO Live.lnk" })
            try { string p = Path.Combine(menu, n); if (File.Exists(p)) File.Delete(p); } catch { }
    }

    // ---------- registri (Pengaturan > Aplikasi) ----------
    static long DirSizeKb(string dir)
    {
        long total = 0;
        try { foreach (string f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories)) total += new FileInfo(f).Length; } catch { }
        return total / 1024;
    }

    static void WriteRegistry(string dir)
    {
        using (RegistryKey k = Registry.CurrentUser.CreateSubKey(UninstallKey))
        {
            string un = Path.Combine(dir, UninstallExe);
            k.SetValue("DisplayName", AppName);
            k.SetValue("DisplayVersion", Version);
            k.SetValue("InstallLocation", dir);
            k.SetValue("DisplayIcon", Path.Combine(dir, "MOMOYO.ico"));
            k.SetValue("UninstallString", "\"" + un + "\" /uninstall");
            k.SetValue("NoModify", 1, RegistryValueKind.DWord);
            k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            k.SetValue("EstimatedSize", (int)Math.Min(int.MaxValue, DirSizeKb(dir)), RegistryValueKind.DWord);
            k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
        }
    }

    static string RegistryInstallDir()
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(UninstallKey))
                return k == null ? null : k.GetValue("InstallLocation") as string;
        }
        catch { return null; }
    }

    // ---------- lepas ----------
    static int RunUninstall(string from)
    {
        string self = Assembly.GetExecutingAssembly().Location;
        string dir = dirOverride ?? from ?? RegistryInstallDir() ?? Path.GetDirectoryName(self);
        dir = Norm(dir);
        GuardDir(dir);
        if (!File.Exists(Path.Combine(dir, Marker)))
            throw new InvalidOperationException("Ini bukan folder pemasangan MOMOYO Live (penanda tidak ditemukan), tidak ada yang dihapus:\n" + dir);

        // Bila dijalankan dari dalam folder pemasangan, salin diri ke TEMP agar berkas ini sendiri bisa dihapus.
        if (from == null && IsUnder(self, dir))
        {
            string tmp = Path.Combine(Path.GetTempPath(), "MOMOYO-uninstall-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".exe");
            File.Copy(self, tmp, true);
            string extra = (silent ? " /S" : "") + (keepFlag == 1 ? " /keepdata" : keepFlag == 2 ? " /deletedata" : "")
                         + (startMenuOverride != null ? " /startmenu:\"" + startMenuOverride + "\"" : "");
            ProcessStartInfo p = new ProcessStartInfo(tmp, "/uninstall /from:\"" + dir + "\"" + extra);
            p.UseShellExecute = false;
            Process proc = Process.Start(p);
            if (silent) proc.WaitForExit();
            return silent ? proc.ExitCode : 0;
        }

        bool deleteData;
        if (keepFlag != 0) deleteData = keepFlag == 2;
        else if (silent) deleteData = false;
        else
        {
            if (Ask("Lepas MOMOYO Live dari komputer ini?\n\nLokasi: " + dir, MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question, MessageBoxDefaultButton.Button1) != DialogResult.Yes) return 0;
            deleteData = Ask("Hapus juga data MOMOYO (daftar peserta dan status giveaway)?\n\nPilih Tidak untuk menyimpan data. Pilih Ya untuk menghapusnya permanen (tidak bisa dibatalkan).",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
        }

        ServerInfo run = Health();
        if (run != null && !string.IsNullOrEmpty(run.Root) && IsUnder(run.Root, dir))
        {
            if (!silent && Ask("MOMOYO sedang berjalan dan akan dihentikan. Lanjutkan? Jika sedang LIVE, pilih Tidak.",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return 0;
            if (!StopServerIn(dir)) throw new InvalidOperationException("Server MOMOYO belum berhenti. Jalankan Tutup MOMOYO Live lalu coba lagi.");
        }

        RemoveShortcuts();
        try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); } catch { }

        string leftover = null;
        try
        {
            if (deleteData) { Directory.Delete(dir, true); }
            else
            {
                foreach (string entry in Directory.GetFileSystemEntries(dir))
                {
                    string name = Path.GetFileName(entry);
                    if (Array.IndexOf(Keep, name) >= 0) continue;
                    if (Directory.Exists(entry)) Directory.Delete(entry, true); else File.Delete(entry);
                }
                // Penanda tidak lagi dibutuhkan; data tetap di folder untuk dipakai bila dipasang ulang.
            }
        }
        catch (Exception e) { leftover = e.Message; }

        // hapus salinan sementara diri sendiri setelah proses ini selesai
        if (from != null)
        {
            try
            {
                ProcessStartInfo p = new ProcessStartInfo("cmd.exe", "/c ping -n 3 127.0.0.1 >nul & del /f /q \"" + self + "\"");
                p.WindowStyle = ProcessWindowStyle.Hidden; p.CreateNoWindow = true; p.UseShellExecute = false;
                if (Path.DirectorySeparatorChar == '\\') Process.Start(p); else File.Delete(self);
            }
            catch { }
        }

        string msg = "MOMOYO Live sudah dilepas." + (deleteData ? "" : "\nData Anda tetap ada di:\n" + dir + "\nFolder ini boleh dihapus sendiri jika datanya tidak diperlukan lagi.");
        if (leftover != null) msg += "\n\nSebagian berkas belum terhapus: " + leftover;
        Info(msg);
        return leftover == null ? 0 : 2;
    }
}


static class Boot
{
    static void Note(string text)
    {
        try { File.AppendAllText(Path.Combine(Path.GetTempPath(), "MOMOYO-setup.log"), DateTime.Now.ToString("s") + " " + text + "\r\n"); } catch { }
    }

    static int Go(string[] args) { return Installer.Run(args); }

    [STAThread]
    static int Main(string[] args)
    {
        Note("boot ok, clr=" + Environment.Version + " exe=" + Assembly.GetExecutingAssembly().Location);
        try
        {
            return Go(args);
        }
        catch (Exception e)
        {
            Note("FATAL " + e);
            try { MessageBox.Show("Pemasang gagal dimulai:\n\n" + e, "MOMOYO Live", MessageBoxButtons.OK, MessageBoxIcon.Error); } catch { }
            return 1;
        }
    }
}
