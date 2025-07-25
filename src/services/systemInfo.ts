import { runIloCommand } from "./sshClient.js";

export interface SystemInformation {
  model: string;
  serialNumber: string;
  iloGeneration: string;
  systemRom: string;
  iloFirmware: string;
}

class SystemInfoCache {
  private static instance: SystemInfoCache;
  private cachedInfo: SystemInformation | null = null;
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private fetchPromise: Promise<SystemInformation> | null = null;

  private constructor() {}

  public static getInstance(): SystemInfoCache {
    if (!SystemInfoCache.instance) {
      SystemInfoCache.instance = new SystemInfoCache();
    }
    return SystemInfoCache.instance;
  }

  public async getSystemInfo(): Promise<SystemInformation> {
    const now = Date.now();
    
    // Return cached data if still valid
    if (this.cachedInfo && (now - this.lastFetchTime) < this.CACHE_DURATION) {
      return this.cachedInfo;
    }

    // If already fetching, return the existing promise
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Start new fetch
    this.fetchPromise = this.fetchSystemInfo();
    
    try {
      this.cachedInfo = await this.fetchPromise;
      this.lastFetchTime = now;
      return this.cachedInfo;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async fetchSystemInfo(): Promise<SystemInformation> {
    try {
      console.log("Fetching system information from iLO...");
      
      // Fetch all required information
      const [system1Output, firmware1Output, systemFirmware1Output] = await Promise.all([
        runIloCommand("show system1"),
        runIloCommand("show /map1/firmware1"),
        runIloCommand("show system1/firmware1")
      ]);

      // Debug logging to see actual outputs
      console.log("System1 output:", system1Output);
      console.log("Firmware1 output:", firmware1Output);
      console.log("SystemFirmware1 output:", systemFirmware1Output);

      // Parse the outputs using improved parsing
      const model = this.parseValue(system1Output, "name=") || "Unknown";
      const serialNumber = this.parseValue(system1Output, "number=") || "Unknown";
      const iloGeneration = this.parseValue(firmware1Output, "name=") || "Unknown";
      
      // Parse System ROM (version + date) from system1/firmware1
      const systemRomVersion = this.parseValue(systemFirmware1Output, "version=") || "";
      const systemRomDate = this.parseDate(systemFirmware1Output, "date=") || "";
      const systemRom = systemRomVersion && systemRomDate 
        ? `${systemRomVersion} (${systemRomDate})`
        : systemRomVersion || systemRomDate || "Unknown";

      // Parse iLO Firmware (version + date) from /map1/firmware1
      const iloFirmwareVersion = this.parseValue(firmware1Output, "version=") || "";
      const iloFirmwareDate = this.parseDate(firmware1Output, "date=") || "";
      const iloFirmware = iloFirmwareVersion && iloFirmwareDate 
        ? `${iloFirmwareVersion} (${iloFirmwareDate})`
        : iloFirmwareVersion || iloFirmwareDate || "Unknown";

      const systemInfo: SystemInformation = {
        model,
        serialNumber,
        iloGeneration,
        systemRom,
        iloFirmware
      };

      console.log("System information fetched successfully:", systemInfo);
      return systemInfo;

    } catch (error) {
      console.error("Error fetching system information:", error);
      // Return fallback data
      return {
        model: "Unavailable",
        serialNumber: "Unavailable", 
        iloGeneration: "Unavailable",
        systemRom: "Unavailable",
        iloFirmware: "Unavailable"
      };
    }
  }

  private parseValue(output: string, key: string): string | null {
    const lines = output.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith(key)) {
        // Extract everything after the key, handling multi-word values
        const value = trimmedLine.substring(key.length).trim();
        // Remove quotes if present and return the full value
        return value.replace(/^["']|["']$/g, '');
      }
    }
    return null;
  }

  private parseDate(output: string, key: string): string | null {
    const lines = output.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith(key)) {
        // Extract everything after the key for date parsing
        const value = trimmedLine.substring(key.length).trim();
        // Remove quotes if present and return the full date value
        return value.replace(/^["']|["']$/g, '');
      }
    }
    return null;
  }

  // Method to force refresh the cache
  public async refreshSystemInfo(): Promise<SystemInformation> {
    this.cachedInfo = null;
    this.lastFetchTime = 0;
    return this.getSystemInfo();
  }
}

// Export singleton instance
export const systemInfoCache = SystemInfoCache.getInstance();

// Convenience function for getting system info
export async function getSystemInformation(): Promise<SystemInformation> {
  return systemInfoCache.getSystemInfo();
}

// Initialize system info cache on module load only if iLO is already configured
import { isILoConfigured } from './config.js';

(async () => {
  try {
    const configured = await isILoConfigured();
    if (configured) {
      console.log("iLO is already configured, initializing system information cache...");
      systemInfoCache.getSystemInfo().catch(error => {
        console.error("Failed to initialize system information cache:", error);
      });
    } else {
      console.log("iLO not yet configured, system information cache will initialize after setup completion");
    }
  } catch (error) {
    console.error("Error checking iLO configuration status:", error);
  }
})();
