using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

internal static class Launcher
{
    private static async Task Relay(Stream source, Stream destination)
    {
        var buffer = new byte[64 * 1024];
        int count;
        while ((count = await source.ReadAsync(buffer, 0, buffer.Length)) != 0)
        {
            await destination.WriteAsync(buffer, 0, count);
            // Native messages must arrive even when neither side has more data to send.
            await destination.FlushAsync();
        }
    }

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
                var incoming = Relay(Console.OpenStandardInput(), child.StandardInput.BaseStream);
                var outgoing = Relay(child.StandardOutput.BaseStream, Console.OpenStandardOutput());
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
