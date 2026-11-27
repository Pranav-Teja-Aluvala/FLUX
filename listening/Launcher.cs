using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

internal static class Launcher
{
    private static int Main()
    {
        try
        {
            string folder = AppDomain.CurrentDomain.BaseDirectory;
            var start = new ProcessStartInfo(
                Path.Combine(folder, "venv", "Scripts", "python.exe"),
                "-u \"" + Path.Combine(folder, "host.py") + "\"")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                WorkingDirectory = folder
            };
            using (var child = Process.Start(start))
            {
                var incoming = Console.OpenStandardInput().CopyToAsync(child.StandardInput.BaseStream);
                var outgoing = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
                Task.WhenAny(incoming, outgoing).GetAwaiter().GetResult();
                if (!child.HasExited) child.Kill();
                return 0;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("FLUX listening: " + error.Message);
            return 1;
        }
    }
}
