// =========================
// 1. 全局配置与初始化
// =========================
var map = new BMapGL.Map("map_container");
// 初始视角定位在西北太平洋中心
map.centerAndZoom(new BMapGL.Point(132.0, 20.0), 5);
map.enableScrollWheelZoom(true); // 开启鼠标滚轮缩放

// 配置年份范围 (请根据你实际洗出的数据范围修改)
const START_YEAR = 2001;
const END_YEAR = 2022;

// =========================
// 2. 页面加载逻辑
// =========================
window.onload = function() {
    initYearSelector();
    // 默认加载最新一年 (2022) 的数据，体验更好
    loadYearIndex(END_YEAR); 
    // 让下拉菜单也默认选中最后一年
    document.getElementById('year_select').value = END_YEAR;
};

// 初始化年份下拉菜单
function initYearSelector() {
    var select = document.getElementById('year_select');
    // 倒序循环，让最近的年份排在前面
    for (var y = END_YEAR; y >= START_YEAR; y--) {
        var option = document.createElement('option');
        option.value = y;
        option.text = y + "年";
        select.appendChild(option);
    }

    // 监听下拉菜单变化
    select.onchange = function() {
        var selectedYear = this.value;
        loadYearIndex(selectedYear);
    };
}

// =========================
// 3. 核心功能函数
// =========================

/**
 * 加载某一年的台风索引列表
 */
function loadYearIndex(year) {
    var listDiv = document.getElementById('typhoon_list');
    listDiv.innerHTML = '<div class="loading-text">正在加载 ' + year + ' 年数据...</div>';
    
    // 清除地图上的旧台风路径
    map.clearOverlays();

    // 请求 index_xxxx.json
    fetch(`data/index_${year}.json`)
        .then(res => {
            if (!res.ok) throw new Error("文件不存在 (404)");
            return res.json();
        })
        .then(data => {
            listDiv.innerHTML = ''; // 清空提示
            
            if (data.length === 0) {
                listDiv.innerHTML = '<div class="loading-text">该年份暂无台风数据</div>';
                return;
            }

            data.forEach(tf => {
                var item = document.createElement('div');
                item.className = 'typhoon-item';
                
                // --- 【改动点2：移除了活跃状态显示】 ---
                // 只保留了时间和名字
                var timeStr = tf.start_time ? tf.start_time.split(' ')[0] : '未知时间';
                item.innerHTML = `
                    <div class="typhoon-name">${tf.tfbh} ${tf.name} <small>(${tf.ename})</small></div>
                    <div class="typhoon-info">生成: ${timeStr}</div>
                `;
                
                // 点击事件
                item.onclick = function() {
                    // 样式切换
                    document.querySelectorAll('.typhoon-item').forEach(d => d.classList.remove('active'));
                    item.classList.add('active');
                    
                    // 加载具体路径
                    loadTyphoonPath(tf.tfbh);
                };
                
                listDiv.appendChild(item);
            });
        })
        .catch(err => {
            console.error(err);
            listDiv.innerHTML = `<div class="loading-text" style="color:red">加载失败<br>请检查 data/index_${year}.json 是否存在</div>`;
        });
}

/**
 * 加载并绘制单条台风路径
 */
function loadTyphoonPath(tfId) {
    map.clearOverlays(); // 清除上一条

    fetch(`data/${tfId}.json`)
        .then(res => {
             if (!res.ok) throw new Error("路径文件不存在 (404)");
             return res.json();
        })
        .then(data => {
            var points = data.points;
            var pathArr = [];

            // 1. 遍历点，画圆点和准备线数据
            points.forEach(pt => {
                var bPoint = new BMapGL.Point(pt.lng, pt.lat);
                pathArr.push(bPoint);

                // 根据强度获取颜色
                var color = getColorByStrong(pt.strong);
                
                // --- 【改动点3：调整圆圈大小】 ---
                // 将半径从 20000 改为 4000 (4公里)
                // 这样它依然随地图缩放变化物理大小，但不会在放大时大得离谱
                var circle = new BMapGL.Circle(bPoint, 10000, { 
                    fillColor: color,
                    strokeColor: color, // 边框也用同色
                    strokeWeight: 1,
                    fillOpacity: 0.9
                });
                map.addOverlay(circle);

                // 绑定点击弹窗
                addClickHandler(circle, data.header, pt);
            });

            // 2. 画连接线
            if (pathArr.length > 0) {
                var polyline = new BMapGL.Polyline(pathArr, {
                    strokeColor: "#409EFF", // 路径线颜色可以固定，或者也跟随强度变色（比较复杂）
                    strokeWeight: 2,
                    strokeOpacity: 0.8
                });
                map.addOverlay(polyline);
                
                // 3. 视角自动适配台风路径
                // 稍微延迟一点，确保地图加载完成，体验更好
                setTimeout(() => {
                     var viewport = map.getViewport(pathArr);
                     map.setViewport(viewport, { enableAnimation: true, margins: [20, 20, 20, 340] }); // 左侧留出侧边栏位置
                }, 100);

            }
        })
        .catch(err => {
            alert("路径数据加载失败，请检查控制台错误信息。");
            console.error(err);
        });
}

// 辅助：闭包解决循环绑定事件的问题
function addClickHandler(overlay, header, pt) {
    overlay.addEventListener('click', function(e) {
        // 防止点击穿透到地图
        e.domEvent.stopPropagation();

        var strongColor = getColorByStrong(pt.strong);
        var infoHtml = `
            <div class="info-window-content">
                <div class="info-header">${header.name} (${header.tfbh})</div>
                <div class="info-row"><span class="info-label">时间:</span> ${pt.time}</div>
                <div class="info-row"><span class="info-label">强度:</span> <span style="color:${strongColor};font-weight:bold">${pt.strong || '未知'}</span></div>
                <div class="info-row"><span class="info-label">风速:</span> ${pt.speed ? pt.speed + ' m/s' : '-'}</div>
                <div class="info-row"><span class="info-label">气压:</span> ${pt.pressure ? pt.pressure + ' hPa' : '-'}</div>
                <div class="info-row"><span class="info-label">移向:</span> ${pt.move_dir || '-'}</div>
            </div>
        `;
        // 使用自定义样式的 InfoWindow (需要百度地图较新版本支持，或自己写CSS覆盖)
        var infoWindow = new BMapGL.InfoWindow(infoHtml, {
            width: 250,
            height: 180,
            offset: new BMapGL.Size(0, -10),
            title: "台风详情"
        });
        map.openInfoWindow(infoWindow, overlay.getBounds().getCenter());
    });
}

// --- 【改动点1：更新颜色配置】 ---
// 使用用户指定的精确 RGB 值
function getColorByStrong(strong) {
    if (!strong) return "rgb(153, 153, 153)"; // 默认灰色
    
    // 使用 includes 模糊匹配，防止数据里有 "超强台风级" 这种后缀
    // 注意匹配顺序，先匹配长的、强的
    if (strong.includes("超强台风")) return "rgb(255, 0, 0)";      // 255 0 0
    if (strong.includes("强台风"))   return "rgb(255, 150, 250)";  // 255 150 250
    if (strong.includes("台风"))     return "rgb(255, 197, 12)";   // 255 197 12
    if (strong.includes("强热带风暴")) return "rgb(255, 250, 50)"; // 255 250 50
    if (strong.includes("热带风暴"))   return "rgb(0, 137, 255)";  // 0 137 255
    if (strong.includes("热带低压"))   return "rgb(67, 250, 91)";  // 67 250 91
    
    return "rgb(0, 137, 255)"; // 默认蓝色
}