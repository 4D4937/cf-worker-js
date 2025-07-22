#!/bin/bash

# 配置
API_BASE_URL="https://bash.zrhe2016.workers.dev"
LOCAL_DIR="/root/api"
LOG_FILE="/var/log/api_sync.log"
PID_FILE="/var/run/api_sync.pid"

# 检查是否已经在运行
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Script is already running with PID $(cat "$PID_FILE")"
    exit 1
fi

# 后台运行函数
run_in_background() {
    # 保存当前进程ID
    echo $$ > "$PID_FILE"
    
    # 捕获退出信号，清理PID文件
    trap 'rm -f "$PID_FILE"; exit' INT TERM EXIT
    
    # 创建本地目录
    mkdir -p "$LOCAL_DIR"
    
    # 日志函数
    log() {
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
    }
    
    # 获取远程文件列表
    get_remote_files() {
        curl -s "$API_BASE_URL/list" | jq -r '.[].name' 2>/dev/null
    }
    
    # 下载文件
    download_file() {
        local filename="$1"
        local local_path="$LOCAL_DIR/$filename"
        
        # 创建目录结构
        mkdir -p "$(dirname "$local_path")"
        
        if curl -s "$API_BASE_URL/$filename" -o "$local_path"; then
            log "Downloaded: $filename"
            return 0
        else
            log "Failed to download: $filename"
            return 1
        fi
    }
    
    # 主同步函数
    sync_files() {
        log "Starting sync from $API_BASE_URL to $LOCAL_DIR"
        
        # 获取远程文件列表
        remote_files=$(get_remote_files)
        
        if [ -z "$remote_files" ]; then
            log "No files found or API error"
            return 1
        fi
        
        local success_count=0
        local total_count=0
        
        # 下载每个文件
        while IFS= read -r filename; do
            if [ -n "$filename" ]; then
                total_count=$((total_count + 1))
                if download_file "$filename"; then
                    success_count=$((success_count + 1))
                fi
            fi
        done <<< "$remote_files"
        
        log "Sync completed: $success_count/$total_count files downloaded"
    }
    
    log "Background sync started with PID $$"
    
    # 每3秒执行一次同步
    while true; do
        sync_files
        sleep 3
    done
}

# 自动后台运行
run_in_background &

echo "Sync script started in background with PID $!"
echo "Log file: $LOG_FILE"
echo "PID file: $PID_FILE"
echo "To stop: kill \$(cat $PID_FILE)"
