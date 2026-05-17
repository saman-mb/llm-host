# Setup (run once)

Run in order. Reboot is required after step 01+02.

```
./01-kernel-params.sh    # set amdgpu.gttsize, ttm.pages_limit, amd_iommu=off
./02-groups.sh           # add user to video, render
sudo systemctl reboot    # ← required, kernel params + groups need it
./03-power.sh            # disable GNOME idle-suspend
./04-firewall.sh         # open port 8080
./05-create-toolbox.sh   # pull vulkan-radv image, create container
./06-install-service.sh  # install + enable llama-server.service
```

Then download a model and verify:

```
../scripts/download-model.sh unsloth/Qwen3.6-35B-A3B-GGUF Qwen3.6-35B-A3B-UD-Q8_K_XL.gguf
../scripts/status.sh
../scripts/test-api.sh
```
